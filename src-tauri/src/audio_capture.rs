use std::{
    ffi::{c_char, c_double, c_float, c_int, CStr},
    sync::{mpsc::Sender, Mutex, OnceLock},
    time::Duration,
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
static MICROPHONE_PERMISSION_SENDER: OnceLock<Mutex<Option<Sender<c_int>>>> = OnceLock::new();

fn sender_slot() -> &'static Mutex<Option<Sender<CaptureEvent>>> {
    EVENT_SENDER.get_or_init(|| Mutex::new(None))
}

fn microphone_permission_sender_slot() -> &'static Mutex<Option<Sender<c_int>>> {
    MICROPHONE_PERMISSION_SENDER.get_or_init(|| Mutex::new(None))
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
    fn ulpaso_microphone_authorization_status() -> c_int;
    fn ulpaso_microphone_request_permission(callback: extern "C" fn(c_int));
}

#[cfg(target_os = "macos")]
extern "C" fn receive_microphone_permission(status: c_int) {
    if let Ok(mut slot) = microphone_permission_sender_slot().lock() {
        if let Some(sender) = slot.take() {
            let _ = sender.send(status);
        }
    }
}

fn microphone_permission_name(status: c_int) -> &'static str {
    match status {
        1 => "authorized",
        2 => "denied",
        3 => "restricted",
        _ => "not-determined",
    }
}

pub fn microphone_permission_status() -> &'static str {
    #[cfg(target_os = "macos")]
    unsafe {
        microphone_permission_name(ulpaso_microphone_authorization_status())
    }
    #[cfg(not(target_os = "macos"))]
    "unavailable"
}

pub async fn request_microphone_permission() -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    {
        if microphone_permission_status() != "not-determined" {
            return Ok(microphone_permission_status());
        }
        let (sender, receiver) = std::sync::mpsc::channel();
        {
            let mut slot = microphone_permission_sender_slot()
                .lock()
                .map_err(|_| "Could not initialize microphone permission state")?;
            if slot.is_some() {
                return Err("A microphone permission request is already in progress".into());
            }
            *slot = Some(sender);
        }
        unsafe { ulpaso_microphone_request_permission(receive_microphone_permission) };
        let received = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(Duration::from_secs(120))
        })
        .await
        .map_err(|error| format!("Microphone permission request failed: {error}"))?;
        let status = match received {
            Ok(status) => status,
            Err(_) => {
                if let Ok(mut slot) = microphone_permission_sender_slot().lock() {
                    *slot = None;
                }
                return Err("Microphone permission request timed out".into());
            }
        };
        Ok(microphone_permission_name(status))
    }
    #[cfg(not(target_os = "macos"))]
    Err("This feature is available only on macOS".into())
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
