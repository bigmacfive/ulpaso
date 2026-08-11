//! Deterministic audio preparation for the meeting pipeline.
//!
//! This module intentionally has no Tauri or worker-process dependencies. It
//! accepts timestamped capture buffers and produces bounded mono 16 kHz frames,
//! which makes the most timing-sensitive part of Ulpaso independently testable
//! and reusable by other native frontends.

use crate::audio_capture::AudioSource;
use std::time::{Duration, Instant};

pub(crate) const SAMPLE_RATE: u32 = 16_000;
pub(crate) const AUDIO_FRAME_SAMPLES: usize = 32_000;
pub(crate) const MAX_MEETING_SECONDS: usize = 6 * 60 * 60;
pub(crate) const MAX_MEETING_SAMPLES: usize = SAMPLE_RATE as usize * MAX_MEETING_SECONDS;
const MAX_ALIGNMENT_SKEW_SECONDS: f64 = 5.0;

pub(crate) fn bounded_audio_take(ready: usize, forwarded: usize) -> usize {
    ready
        .min(AUDIO_FRAME_SAMPLES)
        .min(MAX_MEETING_SAMPLES.saturating_sub(forwarded))
}

pub(crate) fn resample_linear(input: &[f32], input_rate: f64, output_rate: f64) -> Vec<f32> {
    if input.is_empty() || input_rate <= 0.0 || output_rate <= 0.0 {
        return Vec::new();
    }
    if (input_rate - output_rate).abs() < 1.0 {
        return input.to_vec();
    }
    let output_len = ((input.len() as f64 * output_rate / input_rate).round() as usize).max(1);
    let scale = input_rate / output_rate;
    (0..output_len)
        .map(|index| {
            let position = index as f64 * scale;
            let left = position.floor() as usize;
            let right = (left + 1).min(input.len() - 1);
            let fraction = (position - left as f64) as f32;
            input[left.min(input.len() - 1)] * (1.0 - fraction) + input[right] * fraction
        })
        .collect()
}

fn mix_audio(system: &[f32], microphone: &[f32], length: usize, microphone_only: bool) -> Vec<f32> {
    (0..length)
        .map(|index| {
            let mic = microphone.get(index).copied().unwrap_or(0.0);
            if microphone_only {
                return mic.clamp(-1.0, 1.0);
            }
            let desktop = system.get(index).copied().unwrap_or(0.0);
            (desktop * 0.65 + mic * 0.82).tanh()
        })
        .collect()
}

pub(crate) fn required_microphone_stalled(
    system_only: bool,
    capture_ready_at: Option<Instant>,
    last_microphone: Instant,
) -> bool {
    !system_only
        && capture_ready_at
            .map(|ready| ready.elapsed() >= Duration::from_secs(3))
            .unwrap_or(false)
        && last_microphone.elapsed() >= Duration::from_secs(3)
}

#[derive(Default)]
pub(crate) struct TimestampMixer {
    origin_seconds: Option<f64>,
    cursor: usize,
    system: Vec<f32>,
    microphone: Vec<f32>,
}

impl TimestampMixer {
    pub(crate) fn push(&mut self, source: AudioSource, presentation_seconds: f64, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        let origin = *self.origin_seconds.get_or_insert(presentation_seconds);
        let delta_seconds = presentation_seconds - origin;
        let mut skip = 0usize;
        let signed_offset = (delta_seconds * SAMPLE_RATE as f64).round() as i64;
        let source_end = match source {
            AudioSource::System => self.system.len(),
            AudioSource::Microphone => self.microphone.len(),
        };
        let latest_end = self.system.len().max(self.microphone.len());
        let expected_offset = if source_end > 0 {
            source_end
        } else {
            latest_end.saturating_sub(samples.len()).max(self.cursor)
        };
        let skew_samples = signed_offset.abs_diff(expected_offset as i64);
        let offset =
            if skew_samples > (MAX_ALIGNMENT_SKEW_SECONDS * SAMPLE_RATE as f64).round() as u64 {
                expected_offset
            } else if signed_offset < 0 && self.cursor == 0 {
                let shift = (-signed_offset) as usize;
                prepend_silence(&mut self.system, shift);
                prepend_silence(&mut self.microphone, shift);
                self.origin_seconds = Some(presentation_seconds);
                0
            } else if signed_offset < self.cursor as i64 {
                skip = (self.cursor as i64 - signed_offset).max(0) as usize;
                if skip >= samples.len() {
                    return;
                }
                self.cursor
            } else {
                signed_offset as usize
            };
        let samples = &samples[skip..];
        let target = match source {
            AudioSource::System => &mut self.system,
            AudioSource::Microphone => &mut self.microphone,
        };
        if target.len() < offset {
            target.resize(offset, 0.0);
        }
        if target.len() < offset + samples.len() {
            target.resize(offset + samples.len(), 0.0);
        }
        target[offset..offset + samples.len()].copy_from_slice(samples);
    }

    pub(crate) fn microphone_available(&self) -> usize {
        self.microphone.len().saturating_sub(self.cursor)
    }

    pub(crate) fn system_available(&self) -> usize {
        self.system.len().saturating_sub(self.cursor)
    }

    pub(crate) fn remaining(&self) -> usize {
        self.system
            .len()
            .max(self.microphone.len())
            .saturating_sub(self.cursor)
    }

    pub(crate) fn take(&mut self, length: usize, microphone_only: bool) -> Vec<f32> {
        let end = self.cursor.saturating_add(length);
        let system = self
            .system
            .get(self.cursor..end)
            .unwrap_or_else(|| self.system.get(self.cursor..).unwrap_or(&[]));
        let microphone = self
            .microphone
            .get(self.cursor..end)
            .unwrap_or_else(|| self.microphone.get(self.cursor..).unwrap_or(&[]));
        let mixed = mix_audio(system, microphone, length, microphone_only);
        self.cursor = end;
        self.compact();
        mixed
    }

    fn compact(&mut self) {
        if self.cursor < AUDIO_FRAME_SAMPLES * 10 {
            return;
        }
        let consumed = self.cursor;
        let system_drain = consumed.min(self.system.len());
        let microphone_drain = consumed.min(self.microphone.len());
        self.system.drain(..system_drain);
        self.microphone.drain(..microphone_drain);
        if let Some(origin) = self.origin_seconds.as_mut() {
            *origin += consumed as f64 / SAMPLE_RATE as f64;
        }
        self.cursor = 0;
    }
}

fn prepend_silence(target: &mut Vec<f32>, length: usize) {
    if length == 0 || target.is_empty() {
        return;
    }
    let mut shifted = Vec::with_capacity(length + target.len());
    shifted.resize(length, 0.0);
    shifted.extend_from_slice(target);
    *target = shifted;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_to_sixteen_kilohertz() {
        let input = vec![0.0; 48_000];
        assert_eq!(resample_linear(&input, 48_000.0, 16_000.0).len(), 16_000);
    }

    #[test]
    fn caps_capture_at_exactly_six_hours() {
        assert_eq!(
            bounded_audio_take(AUDIO_FRAME_SAMPLES, MAX_MEETING_SAMPLES),
            0
        );
        assert_eq!(
            bounded_audio_take(AUDIO_FRAME_SAMPLES, MAX_MEETING_SAMPLES - 137),
            137
        );
        assert_eq!(MAX_MEETING_SAMPLES / SAMPLE_RATE as usize, 21_600);
    }

    #[test]
    fn mixer_keeps_samples_bounded() {
        let mixed = mix_audio(&vec![1.0; 100], &vec![1.0; 100], 100, false);
        assert!(mixed.iter().all(|sample| sample.abs() <= 1.0));
    }

    #[test]
    fn aligns_inputs_using_capture_timestamps() {
        let mut timeline = TimestampMixer::default();
        timeline.push(AudioSource::Microphone, 10.0, &vec![0.5; 16_000]);
        timeline.push(AudioSource::System, 10.5, &vec![0.25; 8_000]);
        let mixed = timeline.take(16_000, false);
        assert!((mixed[1_000] - (0.5_f32 * 0.82).tanh()).abs() < 0.001);
        assert!((mixed[12_000] - (0.25_f32 * 0.65 + 0.5 * 0.82).tanh()).abs() < 0.001);
    }

    #[test]
    fn rebases_when_the_second_callback_has_an_earlier_timestamp() {
        let mut timeline = TimestampMixer::default();
        timeline.push(AudioSource::Microphone, 10.1, &vec![0.5; 1_600]);
        timeline.push(AudioSource::System, 10.0, &vec![0.25; 3_200]);
        let mixed = timeline.take(3_200, false);
        assert!((mixed[800] - (0.25_f32 * 0.65).tanh()).abs() < 0.001);
        assert!((mixed[2_000] - (0.25_f32 * 0.65 + 0.5 * 0.82).tanh()).abs() < 0.001);
    }

    #[test]
    fn mismatched_clock_epochs_do_not_allocate_a_huge_timeline() {
        let mut timeline = TimestampMixer::default();
        timeline.push(AudioSource::System, 0.0, &vec![0.25; 3_200]);
        timeline.push(AudioSource::Microphone, 100_000.0, &vec![0.5; 3_200]);
        assert_eq!(timeline.system.len(), 3_200);
        assert_eq!(timeline.microphone.len(), 3_200);
        assert_eq!(timeline.remaining(), 3_200);
    }

    #[test]
    fn continuous_timestamps_beyond_skew_window_are_not_overwritten() {
        let mut timeline = TimestampMixer::default();
        for index in 0..50 {
            timeline.push(
                AudioSource::System,
                index as f64 * 0.2,
                &vec![index as f32; 3_200],
            );
        }
        assert_eq!(timeline.system.len(), 160_000);
        assert_eq!(timeline.remaining(), 160_000);
        assert_eq!(timeline.system[156_800], 49.0);
    }

    #[test]
    fn system_audio_is_available_without_microphone_samples() {
        let mut timeline = TimestampMixer::default();
        timeline.push(AudioSource::System, 10.0, &vec![0.25; AUDIO_FRAME_SAMPLES]);
        assert_eq!(timeline.system_available(), AUDIO_FRAME_SAMPLES);
        assert_eq!(timeline.microphone_available(), 0);
        let mixed = timeline.take(AUDIO_FRAME_SAMPLES, false);
        assert!(mixed.iter().all(|sample| *sample > 0.0));
    }

    #[test]
    fn microphone_required_modes_do_not_depend_on_system_audio_for_the_watchdog() {
        let capture_ready = Instant::now() - Duration::from_secs(4);
        let last_microphone = Instant::now() - Duration::from_secs(4);
        assert!(required_microphone_stalled(
            false,
            Some(capture_ready),
            last_microphone,
        ));
        assert!(!required_microphone_stalled(
            true,
            Some(capture_ready),
            last_microphone,
        ));
    }
}
