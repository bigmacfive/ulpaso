#import <AppKit/AppKit.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreGraphics/CoreGraphics.h>

#include <libproc.h>

#include <algorithm>
#include <cstring>
#include <vector>

namespace {
void CopyUtf8(NSString *value, char *destination, size_t length) {
  if (!destination || length == 0) return;
  destination[0] = '\0';
  if (!value) return;
  const char *source = value.UTF8String;
  if (!source) return;
  std::strncpy(destination, source, length - 1);
  destination[length - 1] = '\0';
}

bool DefaultMicrophoneIsRunning() {
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

  UInt32 running = 0;
  UInt32 runningSize = sizeof(running);
  AudioObjectPropertyAddress isRunning = {
      kAudioDevicePropertyDeviceIsRunningSomewhere,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain,
  };
  return AudioObjectGetPropertyData(device, &isRunning, 0, nullptr,
                                    &runningSize, &running) == noErr &&
         running != 0;
}

bool IsDescendantProcess(pid_t candidate, pid_t ancestor) {
  if (candidate <= 0 || ancestor <= 0) return false;
  for (int depth = 0; depth < 32 && candidate > 1; ++depth) {
    if (candidate == ancestor) return true;
    struct proc_bsdinfo info = {};
    if (proc_pidinfo(candidate, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) !=
        sizeof(info)) {
      return false;
    }
    const pid_t parent = static_cast<pid_t>(info.pbi_ppid);
    if (parent <= 0 || parent == candidate) return false;
    candidate = parent;
  }
  return false;
}

bool ProcessTreeHasRunningOutput(pid_t rootProcessID) {
  AudioObjectPropertyAddress listAddress = {
      kAudioHardwarePropertyProcessObjectList,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain,
  };
  UInt32 listSize = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &listAddress, 0,
                                     nullptr, &listSize) != noErr ||
      listSize == 0) {
    return false;
  }

  std::vector<AudioObjectID> processes(listSize / sizeof(AudioObjectID));
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &listAddress, 0,
                                 nullptr, &listSize, processes.data()) !=
      noErr) {
    return false;
  }

  for (AudioObjectID process : processes) {
    UInt32 runningOutput = 0;
    UInt32 runningSize = sizeof(runningOutput);
    AudioObjectPropertyAddress runningAddress = {
        kAudioProcessPropertyIsRunningOutput,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain,
    };
    if (AudioObjectGetPropertyData(process, &runningAddress, 0, nullptr,
                                   &runningSize, &runningOutput) != noErr ||
        runningOutput == 0) {
      continue;
    }

    pid_t processID = 0;
    UInt32 processIDSize = sizeof(processID);
    AudioObjectPropertyAddress processIDAddress = {
        kAudioProcessPropertyPID,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain,
    };
    if (AudioObjectGetPropertyData(process, &processIDAddress, 0, nullptr,
                                   &processIDSize, &processID) == noErr &&
        IsDescendantProcess(processID, rootProcessID)) {
      return true;
    }
  }
  return false;
}

NSString *LargestFrontmostWindowTitle(pid_t processID) {
  CFArrayRef windows = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!windows) return nil;

  NSString *title = nil;
  double largestArea = 0.0;
  for (NSDictionary *window in (__bridge NSArray *)windows) {
    NSNumber *ownerPID = window[(id)kCGWindowOwnerPID];
    NSNumber *layer = window[(id)kCGWindowLayer];
    if (ownerPID.intValue != processID || layer.intValue != 0) continue;

    CGRect bounds = CGRectZero;
    NSDictionary *boundsDictionary = window[(id)kCGWindowBounds];
    if (!boundsDictionary || !CGRectMakeWithDictionaryRepresentation(
                                 (__bridge CFDictionaryRef)boundsDictionary,
                                 &bounds)) {
      continue;
    }
    const double area = bounds.size.width * bounds.size.height;
    NSString *candidate = window[(id)kCGWindowName];
    if (area > largestArea && candidate.length > 0) {
      largestArea = area;
      title = candidate;
    }
  }
  CFRelease(windows);
  return title;
}
}  // namespace

extern "C" int ulpaso_meeting_environment(
    char *bundleID, size_t bundleIDLength, char *appName,
    size_t appNameLength, char *windowTitle, size_t windowTitleLength) {
  @autoreleasepool {
    NSRunningApplication *application =
        NSWorkspace.sharedWorkspace.frontmostApplication;
    CopyUtf8(application.bundleIdentifier, bundleID, bundleIDLength);
    CopyUtf8(application.localizedName, appName, appNameLength);
    CopyUtf8(LargestFrontmostWindowTitle(application.processIdentifier),
             windowTitle, windowTitleLength);
    const bool microphoneActive = DefaultMicrophoneIsRunning();
    const bool systemAudioActive =
        application && ProcessTreeHasRunningOutput(application.processIdentifier);
    return (microphoneActive ? 1 : 0) | (systemAudioActive ? 2 : 0);
  }
}

extern "C" int ulpaso_process_tree_has_running_output(pid_t processID) {
  return ProcessTreeHasRunningOutput(processID) ? 1 : 0;
}
