//! Framed PCM transport and disk-backed replay for the local ASR worker.
//!
//! The queue carries only file offsets, so a stalled or restarting model does
//! not make live audio accumulate in memory. A new worker generation is fed
//! from byte zero before live delivery resumes.

use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    process::ChildStdin,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{Receiver, Sender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use super::audio::AUDIO_FRAME_SAMPLES;

const WORKER_PCM_CHUNK_BYTES: usize = AUDIO_FRAME_SAMPLES * std::mem::size_of::<f32>();

pub(crate) type WorkerInput = Arc<Mutex<Option<ChildStdin>>>;

#[derive(Debug)]
pub(crate) enum WorkerQueueMessage {
    Pcm { end_offset: u64 },
    Finish { end_offset: u64 },
    Cancel,
}

pub(crate) fn write_worker_frame(
    stdin: &WorkerInput,
    kind: u8,
    payload: &[u8],
) -> Result<(), String> {
    let mut guard = stdin.lock().map_err(|_| "Could not lock worker input")?;
    let stdin = guard
        .as_mut()
        .ok_or_else(|| "The worker is recovering".to_string())?;
    stdin
        .write_all(&[kind])
        .map_err(|error| error.to_string())?;
    stdin
        .write_all(&(payload.len() as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;
    stdin
        .write_all(payload)
        .map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

pub(crate) fn append_worker_pcm(
    spool: &mut File,
    queue: &Sender<WorkerQueueMessage>,
    offset: &mut u64,
    payload: &[u8],
) -> Result<(), String> {
    spool
        .write_all(payload)
        .and_then(|_| spool.flush())
        .map_err(|error| format!("Could not write live transcription PCM: {error}"))?;
    *offset = offset.saturating_add(payload.len() as u64);
    queue
        .send(WorkerQueueMessage::Pcm {
            end_offset: *offset,
        })
        .map_err(|_| "The transcription input queue closed unexpectedly".to_string())
}

pub(crate) fn worker_feeder_loop(
    stdin: WorkerInput,
    generation: Arc<AtomicU64>,
    shutdown: Arc<AtomicBool>,
    pcm_path: PathBuf,
    queue: Receiver<WorkerQueueMessage>,
) -> Result<(), String> {
    let mut spool = File::open(&pcm_path)
        .map_err(|error| format!("Could not open live transcription PCM: {error}"))?;
    let mut active_generation = 0u64;
    let mut replayed_until = 0u64;

    while let Ok(message) = queue.recv() {
        match message {
            WorkerQueueMessage::Pcm { end_offset } => sync_worker_spool(
                &stdin,
                &generation,
                &shutdown,
                &mut spool,
                &mut active_generation,
                &mut replayed_until,
                end_offset,
            )?,
            WorkerQueueMessage::Finish { end_offset } => loop {
                sync_worker_spool(
                    &stdin,
                    &generation,
                    &shutdown,
                    &mut spool,
                    &mut active_generation,
                    &mut replayed_until,
                    end_offset,
                )?;
                if generation.load(Ordering::Acquire) != active_generation {
                    continue;
                }
                match write_worker_frame(&stdin, 2, &[]) {
                    Ok(()) => return Ok(()),
                    Err(_) => {
                        wait_for_worker_generation(&generation, &shutdown, active_generation)?
                    }
                }
            },
            WorkerQueueMessage::Cancel => {
                let _ = write_worker_frame(&stdin, 3, &[]);
                return Ok(());
            }
        }
    }
    Err("The transcription input queue is closed".into())
}

fn sync_worker_spool(
    stdin: &WorkerInput,
    generation: &AtomicU64,
    shutdown: &AtomicBool,
    spool: &mut File,
    active_generation: &mut u64,
    replayed_until: &mut u64,
    end_offset: u64,
) -> Result<(), String> {
    while *replayed_until < end_offset {
        if shutdown.load(Ordering::Acquire) {
            return Err("Transcription input was canceled".into());
        }
        let current_generation = generation.load(Ordering::Acquire);
        if current_generation == 0 {
            thread::sleep(Duration::from_millis(20));
            continue;
        }
        if current_generation != *active_generation {
            *active_generation = current_generation;
            *replayed_until = 0;
            spool
                .seek(SeekFrom::Start(0))
                .map_err(|error| error.to_string())?;
            #[cfg(debug_assertions)]
            eprintln!(
                "[meeting-recovery] feeding PCM from the beginning for worker generation {}",
                current_generation,
            );
        }

        let remaining = (end_offset - *replayed_until) as usize;
        let size = remaining.min(WORKER_PCM_CHUNK_BYTES);
        let mut payload = vec![0u8; size];
        spool
            .seek(SeekFrom::Start(*replayed_until))
            .and_then(|_| spool.read_exact(&mut payload))
            .map_err(|error| format!("Could not read live transcription PCM: {error}"))?;
        match write_worker_frame(stdin, 1, &payload) {
            Ok(()) => *replayed_until += size as u64,
            Err(_) => wait_for_worker_generation(generation, shutdown, *active_generation)?,
        }
    }
    Ok(())
}

fn wait_for_worker_generation(
    generation: &AtomicU64,
    shutdown: &AtomicBool,
    failed_generation: u64,
) -> Result<(), String> {
    while generation.load(Ordering::Acquire) == failed_generation {
        if shutdown.load(Ordering::Acquire) {
            return Err("Transcription input was canceled".into());
        }
        thread::sleep(Duration::from_millis(50));
    }
    Ok(())
}

pub(crate) fn f32_bytes(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        process::{Command, Stdio},
        sync::mpsc,
    };
    use uuid::Uuid;

    #[test]
    fn encodes_worker_pcm_as_little_endian_floats() {
        let bytes = f32_bytes(&[0.5, -0.25]);
        assert_eq!(&bytes[..4], &0.5_f32.to_le_bytes());
        assert_eq!(&bytes[4..], &(-0.25_f32).to_le_bytes());
    }

    #[test]
    fn disk_spooled_worker_feed_preserves_every_pcm_byte() {
        let path = std::env::temp_dir().join(format!("ulpaso-pcm-spool-{}.pcm", Uuid::new_v4()));
        let payload = (0..(WORKER_PCM_CHUNK_BYTES + 257))
            .map(|index| (index % 251) as u8)
            .collect::<Vec<_>>();
        std::fs::write(&path, &payload).expect("write PCM spool");

        let mut child = Command::new("/bin/cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("spawn protocol sink");
        let stdin = Arc::new(Mutex::new(child.stdin.take()));
        let mut stdout = child.stdout.take().expect("capture protocol output");
        let generation = Arc::new(AtomicU64::new(1));
        let shutdown = Arc::new(AtomicBool::new(false));
        let (queue_tx, queue_rx) = mpsc::channel();
        let feeder_stdin = stdin.clone();
        let feeder_generation = generation.clone();
        let feeder_shutdown = shutdown.clone();
        let feeder_path = path.clone();
        let feeder = thread::spawn(move || {
            worker_feeder_loop(
                feeder_stdin,
                feeder_generation,
                feeder_shutdown,
                feeder_path,
                queue_rx,
            )
        });

        queue_tx
            .send(WorkerQueueMessage::Pcm {
                end_offset: payload.len() as u64,
            })
            .expect("queue PCM");
        queue_tx
            .send(WorkerQueueMessage::Finish {
                end_offset: payload.len() as u64,
            })
            .expect("queue finish");
        feeder.join().expect("join feeder").expect("feed worker");
        *stdin.lock().expect("drop worker stdin") = None;

        let mut framed = Vec::new();
        stdout
            .read_to_end(&mut framed)
            .expect("read protocol output");
        child.wait().expect("wait protocol sink");
        let mut cursor = 0usize;
        let mut decoded_pcm = Vec::new();
        let mut kinds = Vec::new();
        while cursor + 5 <= framed.len() {
            let kind = framed[cursor];
            let size =
                u32::from_le_bytes(framed[cursor + 1..cursor + 5].try_into().unwrap()) as usize;
            cursor += 5;
            kinds.push(kind);
            if kind == 1 {
                decoded_pcm.extend_from_slice(&framed[cursor..cursor + size]);
            }
            cursor += size;
        }

        assert_eq!(decoded_pcm, payload);
        assert_eq!(kinds, vec![1, 1, 2]);
        assert_eq!(cursor, framed.len());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn worker_queue_retains_offsets_instead_of_audio_payloads() {
        assert!(std::mem::size_of::<WorkerQueueMessage>() <= 24);
    }
}
