#import <Foundation/Foundation.h>

#include <cstdint>

extern "C" int ulpaso_meeting_environment(
    char *bundleID, size_t bundleIDLength, char *appName,
    size_t appNameLength, char *windowTitle, size_t windowTitleLength,
    uint32_t *windowID);

int main() {
  @autoreleasepool {
    char bundleID[256] = {};
    char appName[256] = {};
    char windowTitle[1024] = {};
    uint32_t windowID = 0;
    const bool microphoneActive = ulpaso_meeting_environment(
        bundleID, sizeof(bundleID), appName, sizeof(appName), windowTitle,
        sizeof(windowTitle), &windowID) == 1;
    NSDictionary *payload = @{
      @"microphoneActive" : @(microphoneActive),
      @"bundleId" : [NSString stringWithUTF8String:bundleID],
      @"appName" : [NSString stringWithUTF8String:appName],
      @"windowTitle" : [NSString stringWithUTF8String:windowTitle],
      @"windowId" : @(windowID),
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSFileHandle *output = [NSFileHandle fileHandleWithStandardOutput];
    [output writeData:data];
    [output writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
  }
  return 0;
}
