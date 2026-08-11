use std::{
    ffi::{c_char, c_double, c_float, c_int, CStr},
    sync::{mpsc::Sender, Mutex, OnceLock},
};

#[derive(Debug)]
pub enum CaptureEvent {
    Audio {
        samples: Vec<f32>,
        sample_rate: f64,
        presentation_seconds: f64,
        source: AudioSource,
    },
    State {
        code: i32,
        message: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AudioSource {
    System,
    Microphone,
}

static EVENT_SENDER: OnceLock<Mutex<Option<Sender<CaptureEvent>>>> = OnceLock::new();

fn sender_slot() -> &'static Mutex<Option<Sender<CaptureEvent>>> {
    EVENT_SENDER.get_or_init(|| Mutex::new(None))
}

#[cfg(target_os = "macos")]
extern "C" {
    fn ulpaso_audio_capture_available() -> c_int;
    fn ulpaso_audio_capture_start(
        audio_callback: extern "C" fn(*const c_float, usize, c_double, c_double, c_int),
        state_callback: extern "C" fn(c_int, *const c_char),
        microphone_only: c_int,
    );
    fn ulpaso_audio_capture_stop();
}

#[cfg(target_os = "macos")]
extern "C" fn receive_audio(
    samples: *const c_float,
    sample_count: usize,
    sample_rate: c_double,
    presentation_seconds: c_double,
    source: c_int,
) {
    if samples.is_null() || sample_count == 0 {
        return;
    }
    let copied = unsafe { std::slice::from_raw_parts(samples, sample_count) }.to_vec();
    let event = CaptureEvent::Audio {
        samples: copied,
        sample_rate,
        presentation_seconds,
        source: if source == 1 {
            AudioSource::Microphone
        } else {
            AudioSource::System
        },
    };
    if let Ok(slot) = sender_slot().lock() {
        if let Some(sender) = slot.as_ref() {
            let _ = sender.send(event);
        }
    }
}

#[cfg(target_os = "macos")]
extern "C" fn receive_state(code: c_int, message: *const c_char) {
    let message = if message.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(message) }
            .to_string_lossy()
            .into_owned()
    };
    if let Ok(slot) = sender_slot().lock() {
        if let Some(sender) = slot.as_ref() {
            let _ = sender.send(CaptureEvent::State { code, message });
        }
    }
}

pub fn is_available() -> bool {
    #[cfg(target_os = "macos")]
    unsafe {
        ulpaso_audio_capture_available() == 1
    }
    #[cfg(not(target_os = "macos"))]
    false
}

pub fn start(
    sender: Sender<CaptureEvent>,
    microphone_only: bool,
    system_only: bool,
) -> Result<(), String> {
    if !is_available() {
        return Err(
            "Meeting transcription requires an Apple Silicon Mac running macOS 15 or later".into(),
        );
    }
    *sender_slot()
        .lock()
        .map_err(|_| "Could not initialize audio capture state")? = Some(sender);
    #[cfg(target_os = "macos")]
    unsafe {
        ulpaso_audio_capture_start(
            receive_audio,
            receive_state,
            if microphone_only {
                1
            } else if system_only {
                2
            } else {
                0
            },
        );
    }
    Ok(())
}

pub fn stop() {
    #[cfg(target_os = "macos")]
    unsafe {
        ulpaso_audio_capture_stop();
    }
}

pub fn clear_sender() {
    if let Ok(mut slot) = sender_slot().lock() {
        *slot = None;
    }
}
