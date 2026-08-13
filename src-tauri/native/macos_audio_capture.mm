#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreMedia/CoreMedia.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <vector>

extern "C" {
typedef void (*UlpasoAudioCallback)(const float *samples,
                                    size_t sample_count,
                                    double sample_rate,
                                    double presentation_seconds,
                                    int source);
typedef void (*UlpasoCaptureStateCallback)(int state, const char *message);
}

namespace {
UlpasoAudioCallback gAudioCallback = nullptr;
UlpasoCaptureStateCallback gStateCallback = nullptr;

int MicrophoneAuthorizationCode(AVAuthorizationStatus status) {
  switch (status) {
    case AVAuthorizationStatusAuthorized:
      return 1;
    case AVAuthorizationStatusDenied:
      return 2;
    case AVAuthorizationStatusRestricted:
      return 3;
    case AVAuthorizationStatusNotDetermined:
    default:
      return 0;
  }
}

bool DiagnosticsEnabled() {
  const char *value = std::getenv("ULPASO_ASR_DIAGNOSTICS");
  return value && std::strcmp(value, "1") == 0;
}

void EmitState(int state, NSString *message) {
  if (!gStateCallback) return;
  gStateCallback(state, message ? message.UTF8String : "");
}

float ReadSample(const uint8_t *data, size_t index,
                 const AudioStreamBasicDescription &asbd) {
  const bool isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0;
  const bool isSigned = (asbd.mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0;
  if (isFloat && asbd.mBitsPerChannel == 32) {
    return reinterpret_cast<const float *>(data)[index];
  }
  if (isFloat && asbd.mBitsPerChannel == 64) {
    return static_cast<float>(reinterpret_cast<const double *>(data)[index]);
  }
  if (isSigned && asbd.mBitsPerChannel == 16) {
    return static_cast<float>(reinterpret_cast<const int16_t *>(data)[index]) / 32768.0f;
  }
  if (isSigned && asbd.mBitsPerChannel == 32) {
    return static_cast<float>(reinterpret_cast<const int32_t *>(data)[index]) / 2147483648.0f;
  }
  return 0.0f;
}

bool HasDefaultInputChannels() {
  AudioDeviceID device = kAudioObjectUnknown;
  UInt32 deviceSize = sizeof(device);
  AudioObjectPropertyAddress defaultInput = {
      kAudioHardwarePropertyDefaultInputDevice,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain,
  };
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &defaultInput, 0,
                                 nullptr, &deviceSize, &device) != noErr ||
      device == kAudioObjectUnknown) {
    return false;
  }

  AudioObjectPropertyAddress streamConfiguration = {
      kAudioDevicePropertyStreamConfiguration,
      kAudioDevicePropertyScopeInput,
      kAudioObjectPropertyElementMain,
  };
  UInt32 listSize = 0;
  if (AudioObjectGetPropertyDataSize(device, &streamConfiguration, 0, nullptr,
                                     &listSize) != noErr ||
      listSize < sizeof(AudioBufferList)) {
    return false;
  }
  std::vector<uint8_t> storage(listSize);
  AudioBufferList *list = reinterpret_cast<AudioBufferList *>(storage.data());
  if (AudioObjectGetPropertyData(device, &streamConfiguration, 0, nullptr,
                                 &listSize, list) != noErr) {
    return false;
  }
  UInt32 channels = 0;
  for (UInt32 index = 0; index < list->mNumberBuffers; ++index) {
    channels += list->mBuffers[index].mNumberChannels;
  }
  return channels > 0;
}
}  // namespace

extern "C" int ulpaso_microphone_authorization_status() {
  return MicrophoneAuthorizationCode(
      [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]);
}

extern "C" void ulpaso_microphone_request_permission(void (*callback)(int)) {
  AVAuthorizationStatus status =
      [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
  if (status != AVAuthorizationStatusNotDetermined) {
    if (callback) callback(MicrophoneAuthorizationCode(status));
    return;
  }

  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
                           completionHandler:^(BOOL granted) {
    (void)granted;
    AVAuthorizationStatus resolved =
        [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (callback) callback(MicrophoneAuthorizationCode(resolved));
  }];
}

@interface UlpasoCapture : NSObject <SCStreamDelegate, SCStreamOutput>
@property(nonatomic, strong) SCStream *stream;
@property(nonatomic, strong) AVAudioEngine *microphoneEngine;
@property(nonatomic, strong) dispatch_queue_t systemQueue;
@property(nonatomic, strong) dispatch_queue_t microphoneQueue;
@property(nonatomic, assign) BOOL microphoneOnly;
@property(nonatomic, assign) BOOL systemOnly;
- (BOOL)startMicrophoneEngine:(BOOL)emitReady;
- (void)stopMicrophoneEngine;
- (void)startSystemCapture;
@end

@implementation UlpasoCapture

- (instancetype)init {
  self = [super init];
  if (self) {
    _systemQueue = dispatch_queue_create("app.ulpaso.capture.system", DISPATCH_QUEUE_SERIAL);
    _microphoneQueue = dispatch_queue_create("app.ulpaso.capture.microphone", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)startMode:(int)captureMode {
  const BOOL microphoneOnly = captureMode == 1;
  const BOOL systemOnly = captureMode == 2;
  self.microphoneOnly = microphoneOnly;
  self.systemOnly = systemOnly;
  EmitState(1, @"오디오 권한을 확인하고 있습니다");

  if (microphoneOnly) {
    [self startMicrophoneOnly];
    return;
  }

  if (systemOnly) {
    [self startSystemCapture];
    return;
  }

  // ScreenCaptureKit does not itself present the AVFoundation microphone
  // consent prompt. Without an explicit request the system-audio stream can
  // start successfully while microphone buffers are silently omitted.
  AVAuthorizationStatus microphoneAuthorization =
      [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
  if (microphoneAuthorization == AVAuthorizationStatusNotDetermined) {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
                             completionHandler:^(BOOL granted) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!granted) {
          EmitState(-2, @"마이크 권한이 필요합니다. 시스템 설정에서 Ulpaso의 마이크 접근을 허용한 뒤 다시 시도해 주세요.");
          return;
        }
        [self startMode:0];
      });
    }];
    return;
  }
  if (microphoneAuthorization != AVAuthorizationStatusAuthorized) {
    EmitState(-2, @"마이크 권한이 꺼져 있습니다. 시스템 설정에서 Ulpaso의 마이크 접근을 허용한 뒤 다시 시도해 주세요.");
    return;
  }
  if (![self startMicrophoneEngine:NO]) return;

  [self startSystemCapture];
}

- (void)startSystemCapture {
  const BOOL microphoneOnly = self.microphoneOnly;
  const BOOL systemOnly = self.systemOnly;

  [SCShareableContent
      getShareableContentExcludingDesktopWindows:NO
                          onScreenWindowsOnly:YES
                           completionHandler:^(SCShareableContent *content, NSError *error) {
    if (error || content.displays.count == 0) {
      NSString *message = error.localizedDescription ?: @"캡처할 디스플레이를 찾을 수 없습니다";
      [self stopMicrophoneEngine];
      EmitState(-1, message);
      return;
    }

    SCDisplay *display = content.displays.firstObject;
    NSMutableArray<SCRunningApplication *> *excluded = [NSMutableArray array];
    NSMutableArray<SCRunningApplication *> *included = [NSMutableArray array];
    NSString *bundleID = NSBundle.mainBundle.bundleIdentifier;
    NSString *captureOnlyBundleID =
        NSProcessInfo.processInfo.environment[@"ULPASO_CAPTURE_ONLY_BUNDLE_ID"];
    for (SCRunningApplication *application in content.applications) {
      if (bundleID && [application.bundleIdentifier isEqualToString:bundleID]) {
        [excluded addObject:application];
      }
      if (captureOnlyBundleID.length > 0 &&
          [application.bundleIdentifier isEqualToString:captureOnlyBundleID]) {
        [included addObject:application];
      }
    }

    // A display filter only receives audio associated with content on that
    // display. On multi-monitor setups `firstObject` is not guaranteed to be
    // the display hosting the requested app, which yields timestamped silence.
    // Select the display with the largest overlap with an on-screen target-app
    // window. Fall back to the macOS main display for ordinary system capture.
    SCDisplay *mainDisplay = nil;
    const CGDirectDisplayID mainDisplayID = CGMainDisplayID();
    for (SCDisplay *candidate in content.displays) {
      if (candidate.displayID == mainDisplayID) {
        mainDisplay = candidate;
        break;
      }
    }
    if (mainDisplay) display = mainDisplay;
    if (captureOnlyBundleID.length > 0) {
      CGFloat largestOverlap = 0.0;
      for (SCWindow *window in content.windows) {
        if (![window.owningApplication.bundleIdentifier
                isEqualToString:captureOnlyBundleID]) {
          continue;
        }
        for (SCDisplay *candidate in content.displays) {
          CGRect intersection = CGRectIntersection(window.frame, candidate.frame);
          const CGFloat overlap = CGRectIsNull(intersection)
                                      ? 0.0
                                      : intersection.size.width * intersection.size.height;
          if (overlap > largestOverlap) {
            largestOverlap = overlap;
            display = candidate;
          }
        }
      }
    }
    if (DiagnosticsEnabled()) {
      NSLog(@"[meeting-capture-display] id=%u frame=%@ target=%@",
            display.displayID, NSStringFromRect(display.frame),
            captureOnlyBundleID ?: @"system");
    }

    if (captureOnlyBundleID.length > 0 && included.count == 0) {
      [self stopMicrophoneEngine];
      EmitState(-1, [NSString stringWithFormat:@"캡처할 앱을 찾지 못했습니다: %@",
                                               captureOnlyBundleID]);
      return;
    }

    // Use the requested app to select the correct display, but do not restrict
    // audio to its SCRunningApplication object. Chromium routes playback
    // through helper processes which are otherwise omitted and captured as
    // silence. Excluding Ulpaso still prevents transcription feedback.
    SCContentFilter *filter = [[SCContentFilter alloc]
        initWithDisplay:display
        excludingApplications:excluded
        exceptingWindows:@[]];
    SCStreamConfiguration *configuration = [[SCStreamConfiguration alloc] init];
    configuration.width = 2;
    configuration.height = 2;
    configuration.minimumFrameInterval = CMTimeMake(1, 2);
    configuration.queueDepth = 3;
    // ScreenCaptureKit's system-audio path is native 48 kHz stereo. Asking it
    // to perform the 16 kHz mono conversion can produce valid, timestamped
    // buffers filled with silence on some macOS/Chrome combinations. Keep the
    // capture format native and let the Rust mixer do the controlled resample.
    configuration.sampleRate = 48000;
    configuration.channelCount = 2;
    configuration.capturesAudio = !microphoneOnly;
    configuration.excludesCurrentProcessAudio = YES;

    self.stream = [[SCStream alloc] initWithFilter:filter configuration:configuration delegate:self];
    NSError *outputError = nil;
    if (!microphoneOnly) {
      [self.stream addStreamOutput:self
                              type:SCStreamOutputTypeAudio
                sampleHandlerQueue:self.systemQueue
                             error:&outputError];
    }
    if (outputError) {
      [self stopMicrophoneEngine];
      EmitState(-1, outputError.localizedDescription);
      self.stream = nil;
      return;
    }

    [self.stream startCaptureWithCompletionHandler:^(NSError *startError) {
      if (startError) {
        [self stopMicrophoneEngine];
        EmitState(-1, startError.localizedDescription);
        self.stream = nil;
      } else {
        EmitState(2, systemOnly ? @"시스템 오디오 전사를 시작했습니다" : @"시스템 오디오와 마이크 전사를 시작했습니다");
      }
    }];
  }];
}

- (void)startMicrophoneOnly {
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio
                           completionHandler:^(BOOL granted) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!granted) {
        EmitState(-2, @"마이크 권한이 필요합니다. 시스템 설정의 개인정보 보호 및 보안에서 Ulpaso를 허용해 주세요.");
        return;
      }

      [self startMicrophoneEngine:YES];
    });
  }];
}

- (BOOL)startMicrophoneEngine:(BOOL)emitReady {
  if (self.microphoneEngine) return YES;
  if (!HasDefaultInputChannels()) {
    EmitState(-4, @"연결된 마이크 입력 장치를 찾지 못했습니다. 마이크를 연결하거나 시스템 오디오만 시작해 주세요.");
    return NO;
  }
  AVCaptureDevice *device = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeAudio];
  if (!device) {
    EmitState(-4, @"연결된 마이크 입력 장치를 찾지 못했습니다. 마이크를 연결하거나 시스템 오디오만 시작해 주세요.");
    return NO;
  }
  AVAudioEngine *engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *input = engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (!input || !format || format.sampleRate <= 0) {
    EmitState(-1, @"사용할 수 있는 마이크 입력을 찾지 못했습니다");
    return NO;
  }

  [input installTapOnBus:0
              bufferSize:3200
                  format:nil
                   block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    if (!gAudioCallback || buffer.frameLength == 0) return;
    AVAudioFormat *bufferFormat = buffer.format;
    const AVAudioFrameCount frames = buffer.frameLength;
    const AVAudioChannelCount channels =
        std::max<AVAudioChannelCount>(1, bufferFormat.channelCount);
    std::vector<float> mono(frames, 0.0f);
    float *const *channelData = buffer.floatChannelData;
    if (!channelData) return;
    for (AVAudioChannelCount channel = 0; channel < channels; ++channel) {
      const float *samples = channelData[channel];
      if (!samples) continue;
      for (AVAudioFrameCount frame = 0; frame < frames; ++frame) {
        mono[frame] += samples[frame] / static_cast<float>(channels);
      }
    }
    double seconds = 0.0;
    if (when.isHostTimeValid) {
      seconds = [AVAudioTime secondsForHostTime:when.hostTime];
    } else if (when.isSampleTimeValid && bufferFormat.sampleRate > 0) {
      seconds = static_cast<double>(when.sampleTime) / bufferFormat.sampleRate;
    }
    gAudioCallback(mono.data(), mono.size(), bufferFormat.sampleRate, seconds, 1);
  }];

  NSError *error = nil;
  [engine prepare];
  if (![engine startAndReturnError:&error]) {
    [input removeTapOnBus:0];
    EmitState(-1, error.localizedDescription ?: @"마이크를 시작할 수 없습니다");
    return NO;
  }
  self.microphoneEngine = engine;
  if (emitReady) EmitState(2, @"마이크 전사를 시작했습니다");
  return YES;
}

- (void)stopMicrophoneEngine {
  AVAudioEngine *engine = self.microphoneEngine;
  self.microphoneEngine = nil;
  if (!engine) return;
  [engine.inputNode removeTapOnBus:0];
  [engine stop];
}

- (void)stop {
  BOOL stoppedMicrophone = self.microphoneEngine != nil;
  [self stopMicrophoneEngine];
  SCStream *stream = self.stream;
  self.stream = nil;
  if (!stream) {
    EmitState(0, stoppedMicrophone ? @"마이크 캡처가 중지되었습니다" : @"오디오 캡처가 중지되었습니다");
    return;
  }
  [stream stopCaptureWithCompletionHandler:^(NSError *error) {
    EmitState(error ? -1 : 0, error ? error.localizedDescription : @"오디오 캡처가 중지되었습니다");
  }];
}

- (void)stream:(SCStream *)stream
    didStopWithError:(NSError *)error {
  (void)stream;
  EmitState(-1, error.localizedDescription);
}

- (void)stream:(SCStream *)stream
    didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
                   ofType:(SCStreamOutputType)type {
  (void)stream;
  if (!gAudioCallback || !CMSampleBufferIsValid(sampleBuffer)) return;
  if (type != SCStreamOutputTypeAudio && type != SCStreamOutputTypeMicrophone) return;

  CMAudioFormatDescriptionRef description =
      (CMAudioFormatDescriptionRef)CMSampleBufferGetFormatDescription(sampleBuffer);
  if (!description) return;
  const AudioStreamBasicDescription *asbdPtr =
      CMAudioFormatDescriptionGetStreamBasicDescription(description);
  if (!asbdPtr || asbdPtr->mFormatID != kAudioFormatLinearPCM) return;
  const AudioStreamBasicDescription asbd = *asbdPtr;

  size_t listSize = 0;
  OSStatus sizeStatus = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer, &listSize, nullptr, 0, nullptr, nullptr, 0, nullptr);
  if (sizeStatus != noErr || listSize == 0) return;

  std::vector<uint8_t> listStorage(listSize);
  AudioBufferList *bufferList = reinterpret_cast<AudioBufferList *>(listStorage.data());
  CMBlockBufferRef blockBuffer = nullptr;
  OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer, nullptr, bufferList, listSize, nullptr, nullptr,
      kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, &blockBuffer);
  if (status != noErr) return;

  const size_t frames = static_cast<size_t>(CMSampleBufferGetNumSamples(sampleBuffer));
  const size_t channels = std::max<size_t>(1, asbd.mChannelsPerFrame);
  std::vector<float> mono(frames, 0.0f);
  const bool nonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;

  if (nonInterleaved && bufferList->mNumberBuffers > 0) {
    const size_t availableChannels = std::min<size_t>(channels, bufferList->mNumberBuffers);
    for (size_t channel = 0; channel < availableChannels; ++channel) {
      const AudioBuffer &buffer = bufferList->mBuffers[channel];
      if (!buffer.mData) continue;
      const uint8_t *data = static_cast<const uint8_t *>(buffer.mData);
      for (size_t frame = 0; frame < frames; ++frame) {
        mono[frame] += ReadSample(data, frame, asbd) / static_cast<float>(availableChannels);
      }
    }
  } else if (bufferList->mNumberBuffers > 0 && bufferList->mBuffers[0].mData) {
    const uint8_t *data = static_cast<const uint8_t *>(bufferList->mBuffers[0].mData);
    for (size_t frame = 0; frame < frames; ++frame) {
      float value = 0.0f;
      for (size_t channel = 0; channel < channels; ++channel) {
        value += ReadSample(data, frame * channels + channel, asbd);
      }
      mono[frame] = value / static_cast<float>(channels);
    }
  }

  static NSUInteger diagnosticBufferCount = 0;
  if (DiagnosticsEnabled() && diagnosticBufferCount < 4) {
    float peak = 0.0f;
    for (float value : mono) peak = std::max(peak, std::abs(value));
    NSLog(@"[meeting-audio-format] rate=%.0f channels=%u bits=%u bytesPerFrame=%u flags=0x%x frames=%zu peak=%.6f",
          asbd.mSampleRate, asbd.mChannelsPerFrame, asbd.mBitsPerChannel,
          asbd.mBytesPerFrame, asbd.mFormatFlags, frames, peak);
    diagnosticBufferCount += 1;
  }

  CMTime presentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
  const double seconds = CMTIME_IS_NUMERIC(presentation) ? CMTimeGetSeconds(presentation) : 0.0;
  gAudioCallback(mono.data(), mono.size(), asbd.mSampleRate, seconds,
                 type == SCStreamOutputTypeMicrophone ? 1 : 0);
  if (blockBuffer) CFRelease(blockBuffer);
}

@end

namespace {
UlpasoCapture *gCapture = nil;
}

extern "C" int ulpaso_audio_capture_available(void) {
  if (@available(macOS 15.0, *)) return 1;
  return 0;
}

extern "C" void ulpaso_audio_capture_start(UlpasoAudioCallback audioCallback,
                                            UlpasoCaptureStateCallback stateCallback,
                                            int captureMode) {
  gAudioCallback = audioCallback;
  gStateCallback = stateCallback;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!gCapture) gCapture = [[UlpasoCapture alloc] init];
    NSLog(@"[meeting-capture] native start mode=%d", captureMode);
    [gCapture startMode:captureMode];
  });
}

extern "C" void ulpaso_audio_capture_stop(void) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [gCapture stop];
  });
}
