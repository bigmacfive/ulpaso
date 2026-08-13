use serde::Serialize;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const REQUIRED_MATCHES: u8 = 3;
const REQUIRED_MISSES_TO_REARM: u8 = 15;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct MeetingEnvironment {
    microphone_active: bool,
    system_audio_active: bool,
    bundle_id: String,
    app_name: String,
    window_title: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MeetingCandidate {
    bundle_id: String,
    app_name: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDetectionSnapshot {
    available: bool,
    detected: bool,
    app_name: Option<String>,
    bundle_id: Option<String>,
}

#[derive(Debug, Default)]
struct DetectionDebouncer {
    candidate: Option<MeetingCandidate>,
    matches: u8,
    misses: u8,
    announced: bool,
}

#[derive(Debug, PartialEq, Eq)]
enum DetectionTransition {
    Detected(MeetingCandidate),
    Cleared,
}

impl DetectionDebouncer {
    fn observe(&mut self, next: Option<MeetingCandidate>) -> Option<DetectionTransition> {
        if let Some(next) = next {
            self.misses = 0;
            if self.announced {
                return None;
            }

            if self.candidate.as_ref() == Some(&next) {
                self.matches = self.matches.saturating_add(1);
            } else {
                self.candidate = Some(next.clone());
                self.matches = 1;
            }

            if self.matches >= REQUIRED_MATCHES {
                self.announced = true;
                return Some(DetectionTransition::Detected(next));
            }
            return None;
        }

        self.candidate = None;
        self.matches = 0;
        if !self.announced {
            return None;
        }

        self.misses = self.misses.saturating_add(1);
        if self.misses >= REQUIRED_MISSES_TO_REARM {
            self.misses = 0;
            self.announced = false;
            return Some(DetectionTransition::Cleared);
        }
        None
    }
}

#[derive(Clone)]
pub struct MeetingDetectionController {
    app: AppHandle,
    state: Arc<Mutex<MeetingDetectionSnapshot>>,
}

impl MeetingDetectionController {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            state: Arc::new(Mutex::new(MeetingDetectionSnapshot {
                available: cfg!(target_os = "macos"),
                ..MeetingDetectionSnapshot::default()
            })),
        }
    }

    pub fn status(&self) -> MeetingDetectionSnapshot {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default()
    }

    pub fn spawn(self) {
        #[cfg(target_os = "macos")]
        std::thread::spawn(move || {
            let mut debouncer = DetectionDebouncer::default();
            loop {
                let candidate = classify_environment(&read_environment());
                if let Some(transition) = debouncer.observe(candidate) {
                    self.apply(transition);
                }
                std::thread::sleep(POLL_INTERVAL);
            }
        });
    }

    fn apply(&self, transition: DetectionTransition) {
        let snapshot = match transition {
            DetectionTransition::Detected(candidate) => MeetingDetectionSnapshot {
                available: true,
                detected: true,
                app_name: Some(candidate.app_name),
                bundle_id: Some(candidate.bundle_id),
            },
            DetectionTransition::Cleared => MeetingDetectionSnapshot {
                available: true,
                ..MeetingDetectionSnapshot::default()
            },
        };
        if let Ok(mut state) = self.state.lock() {
            *state = snapshot.clone();
        }
        let _ = self.app.emit("meeting://detection", snapshot);
    }
}

fn classify_environment(environment: &MeetingEnvironment) -> Option<MeetingCandidate> {
    if (!environment.microphone_active && !environment.system_audio_active)
        || environment.bundle_id.is_empty()
    {
        return None;
    }

    let bundle = environment.bundle_id.to_ascii_lowercase();
    let desktop_name = match bundle.as_str() {
        "us.zoom.xos" => Some("Zoom"),
        "com.microsoft.teams" | "com.microsoft.teams2" => Some("Microsoft Teams"),
        "com.cisco.webexmeetingsapp" | "cisco-systems.spark" => Some("Webex"),
        "com.apple.facetime" => Some("FaceTime"),
        "com.skype.skype" => Some("Skype"),
        _ => None,
    };
    if let Some(name) = desktop_name {
        return Some(MeetingCandidate {
            bundle_id: environment.bundle_id.clone(),
            app_name: name.into(),
        });
    }

    if !is_supported_browser(&bundle) {
        return None;
    }
    let title = environment.window_title.to_ascii_lowercase();
    let service = if title.contains("google meet") || title.contains("meet.google.com") {
        Some("Google Meet")
    } else if title.contains("microsoft teams") || title.contains("teams.microsoft.com") {
        Some("Microsoft Teams")
    } else if title.contains("zoom meeting") || title.contains("zoom workplace") {
        Some("Zoom")
    } else if title.contains("webex") {
        Some("Webex")
    } else {
        None
    }?;

    Some(MeetingCandidate {
        bundle_id: environment.bundle_id.clone(),
        app_name: service.into(),
    })
}

fn is_supported_browser(bundle_id: &str) -> bool {
    matches!(
        bundle_id,
        "com.apple.safari"
            | "com.google.chrome"
            | "com.google.chrome.canary"
            | "com.microsoft.edgemac"
            | "org.mozilla.firefox"
            | "company.thebrowser.browser"
            | "com.brave.browser"
    )
}

#[cfg(target_os = "macos")]
fn read_environment() -> MeetingEnvironment {
    use std::ffi::CStr;
    use std::os::raw::{c_char, c_int};

    unsafe extern "C" {
        fn ulpaso_meeting_environment(
            bundle_id: *mut c_char,
            bundle_id_length: usize,
            app_name: *mut c_char,
            app_name_length: usize,
            window_title: *mut c_char,
            window_title_length: usize,
        ) -> c_int;
    }

    fn buffer_string(buffer: &[c_char]) -> String {
        unsafe { CStr::from_ptr(buffer.as_ptr()) }
            .to_string_lossy()
            .into_owned()
    }

    let mut bundle_id = [0 as c_char; 256];
    let mut app_name = [0 as c_char; 256];
    let mut window_title = [0 as c_char; 1024];
    let activity = unsafe {
        ulpaso_meeting_environment(
            bundle_id.as_mut_ptr(),
            bundle_id.len(),
            app_name.as_mut_ptr(),
            app_name.len(),
            window_title.as_mut_ptr(),
            window_title.len(),
        )
    };
    MeetingEnvironment {
        microphone_active: activity & 1 != 0,
        system_audio_active: activity & 2 != 0,
        bundle_id: buffer_string(&bundle_id),
        app_name: buffer_string(&app_name),
        window_title: buffer_string(&window_title),
    }
}

#[tauri::command]
pub fn meeting_detection_status(
    controller: tauri::State<'_, MeetingDetectionController>,
) -> MeetingDetectionSnapshot {
    controller.status()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn environment_with_activity(
        bundle_id: &str,
        title: &str,
        microphone_active: bool,
        system_audio_active: bool,
    ) -> MeetingEnvironment {
        MeetingEnvironment {
            microphone_active,
            system_audio_active,
            bundle_id: bundle_id.into(),
            app_name: "App".into(),
            window_title: title.into(),
        }
    }

    fn environment(bundle_id: &str, title: &str, microphone_active: bool) -> MeetingEnvironment {
        environment_with_activity(bundle_id, title, microphone_active, false)
    }

    fn zoom() -> MeetingCandidate {
        MeetingCandidate {
            bundle_id: "us.zoom.xos".into(),
            app_name: "Zoom".into(),
        }
    }

    #[test]
    fn requires_live_input_or_output_for_desktop_meeting_apps() {
        assert_eq!(
            classify_environment(&environment("us.zoom.xos", "", false)),
            None
        );
        assert_eq!(
            classify_environment(&environment("us.zoom.xos", "", true)),
            Some(zoom())
        );
        assert_eq!(
            classify_environment(&environment_with_activity("us.zoom.xos", "", false, true)),
            Some(zoom())
        );
    }

    #[test]
    fn recognizes_supported_browser_meetings_but_not_ordinary_tabs() {
        let meet = classify_environment(&environment(
            "com.google.Chrome",
            "Weekly sync - Google Meet",
            true,
        ));
        assert_eq!(
            meet.map(|candidate| candidate.app_name),
            Some("Google Meet".into())
        );
        assert_eq!(
            classify_environment(&environment(
                "com.google.Chrome",
                "Inbox (12) - Example Mail",
                true,
            )),
            None
        );
        assert_eq!(
            classify_environment(&environment_with_activity(
                "com.google.Chrome",
                "Weekly sync - Google Meet",
                false,
                true,
            ))
            .map(|candidate| candidate.app_name),
            Some("Google Meet".into())
        );
    }

    #[test]
    fn ignores_unsupported_apps_even_when_the_microphone_is_running() {
        assert_eq!(
            classify_environment(&environment("com.apple.VoiceMemos", "Recording", true)),
            None
        );
    }

    #[test]
    fn waits_for_three_stable_samples_before_announcing() {
        let mut debouncer = DetectionDebouncer::default();
        assert_eq!(debouncer.observe(Some(zoom())), None);
        assert_eq!(debouncer.observe(Some(zoom())), None);
        assert_eq!(
            debouncer.observe(Some(zoom())),
            Some(DetectionTransition::Detected(zoom()))
        );
    }

    #[test]
    fn changing_candidate_resets_the_confirmation_count() {
        let mut debouncer = DetectionDebouncer::default();
        let teams = MeetingCandidate {
            bundle_id: "com.microsoft.teams2".into(),
            app_name: "Microsoft Teams".into(),
        };
        assert_eq!(debouncer.observe(Some(zoom())), None);
        assert_eq!(debouncer.observe(Some(zoom())), None);
        assert_eq!(debouncer.observe(Some(teams.clone())), None);
        assert_eq!(debouncer.observe(Some(teams.clone())), None);
        assert_eq!(
            debouncer.observe(Some(teams.clone())),
            Some(DetectionTransition::Detected(teams))
        );
    }

    #[test]
    fn does_not_announce_twice_during_the_same_meeting() {
        let mut debouncer = DetectionDebouncer::default();
        for _ in 0..REQUIRED_MATCHES - 1 {
            assert_eq!(debouncer.observe(Some(zoom())), None);
        }
        assert!(matches!(
            debouncer.observe(Some(zoom())),
            Some(DetectionTransition::Detected(_))
        ));
        for _ in 0..100 {
            assert_eq!(debouncer.observe(Some(zoom())), None);
        }
    }

    #[test]
    fn short_signal_gaps_do_not_rearm_detection() {
        let mut debouncer = DetectionDebouncer::default();
        for _ in 0..REQUIRED_MATCHES {
            debouncer.observe(Some(zoom()));
        }
        for _ in 0..REQUIRED_MISSES_TO_REARM - 1 {
            assert_eq!(debouncer.observe(None), None);
        }
        assert_eq!(debouncer.observe(Some(zoom())), None);
    }

    #[test]
    fn sustained_absence_clears_and_allows_a_later_meeting() {
        let mut debouncer = DetectionDebouncer::default();
        for _ in 0..REQUIRED_MATCHES {
            debouncer.observe(Some(zoom()));
        }
        for _ in 0..REQUIRED_MISSES_TO_REARM - 1 {
            assert_eq!(debouncer.observe(None), None);
        }
        assert_eq!(debouncer.observe(None), Some(DetectionTransition::Cleared));
        for _ in 0..REQUIRED_MATCHES - 1 {
            assert_eq!(debouncer.observe(Some(zoom())), None);
        }
        assert!(matches!(
            debouncer.observe(Some(zoom())),
            Some(DetectionTransition::Detected(_))
        ));
    }
}
