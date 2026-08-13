#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

typedef void (*UlpasoMeetingNotificationCallback)(const char *action);

static NSString *const UlpasoMeetingCategoryIdentifier = @"ULPASO_MEETING_DETECTED";
static NSString *const UlpasoMeetingNotificationIdentifier = @"ulpaso-meeting-detection";
static NSString *const UlpasoMeetingStartActionIdentifier = @"ULPASO_MEETING_START";
static NSString *const UlpasoMeetingDismissActionIdentifier = @"ULPASO_MEETING_DISMISS";

static UlpasoMeetingNotificationCallback gMeetingNotificationCallback = nullptr;

static void ulpaso_emit_meeting_notification_action(const char *action) {
  if (gMeetingNotificationCallback != nullptr) {
    gMeetingNotificationCallback(action);
  }
}

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"

@interface UlpasoMeetingNotificationDelegate
    : NSObject <UNUserNotificationCenterDelegate, NSUserNotificationCenterDelegate>
@end

@implementation UlpasoMeetingNotificationDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler {
  (void)center;
  (void)notification;
  completionHandler(UNNotificationPresentationOptionBanner |
                    UNNotificationPresentationOptionList |
                    UNNotificationPresentationOptionSound);
}

- (BOOL)userNotificationCenter:(NSUserNotificationCenter *)center
      shouldPresentNotification:(NSUserNotification *)notification {
  (void)center;
  (void)notification;
  return YES;
}

- (void)userNotificationCenter:(NSUserNotificationCenter *)center
        didActivateNotification:(NSUserNotification *)notification {
  (void)center;
  if (notification.activationType == NSUserNotificationActivationTypeActionButtonClicked) {
    ulpaso_emit_meeting_notification_action("start");
  } else if (notification.activationType == NSUserNotificationActivationTypeContentsClicked) {
    ulpaso_emit_meeting_notification_action("open");
  } else if (notification.activationType == NSUserNotificationActivationTypeAdditionalActionClicked &&
             [notification.additionalActivationAction.identifier
                 isEqualToString:UlpasoMeetingDismissActionIdentifier]) {
    ulpaso_emit_meeting_notification_action("dismiss");
  }
  [center removeDeliveredNotification:notification];
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
 didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
  (void)center;
  NSString *identifier = response.actionIdentifier;
  if ([identifier isEqualToString:UlpasoMeetingStartActionIdentifier]) {
    ulpaso_emit_meeting_notification_action("start");
  } else if ([identifier isEqualToString:UlpasoMeetingDismissActionIdentifier] ||
             [identifier isEqualToString:UNNotificationDismissActionIdentifier]) {
    ulpaso_emit_meeting_notification_action("dismiss");
  } else if ([identifier isEqualToString:UNNotificationDefaultActionIdentifier]) {
    ulpaso_emit_meeting_notification_action("open");
  }
  completionHandler();
}

@end

static UlpasoMeetingNotificationDelegate *gMeetingNotificationDelegate;

static NSString *ulpaso_string(const char *value) {
  if (value == nullptr) {
    return @"";
  }
  NSString *result = [NSString stringWithUTF8String:value];
  return result ?: @"";
}

static void ulpaso_schedule_legacy_meeting_notification(NSString *title,
                                                         NSString *body,
                                                         NSString *startTitle,
                                                         NSString *dismissTitle) {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSUserNotificationCenter *center =
        [NSUserNotificationCenter defaultUserNotificationCenter];
    center.delegate = gMeetingNotificationDelegate;
    for (NSUserNotification *delivered in center.deliveredNotifications) {
      if ([delivered.identifier isEqualToString:UlpasoMeetingNotificationIdentifier]) {
        [center removeDeliveredNotification:delivered];
      }
    }

    NSUserNotification *notification = [[NSUserNotification alloc] init];
    notification.identifier = UlpasoMeetingNotificationIdentifier;
    notification.title = title;
    notification.informativeText = body;
    notification.hasActionButton = YES;
    notification.actionButtonTitle = startTitle;
    notification.otherButtonTitle = dismissTitle;
    notification.soundName = NSUserNotificationDefaultSoundName;
    [center deliverNotification:notification];
  });
}

static void ulpaso_schedule_meeting_notification(NSString *title,
                                                  NSString *body,
                                                  NSString *startTitle,
                                                  NSString *dismissTitle) {
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  UNNotificationAction *startAction =
      [UNNotificationAction actionWithIdentifier:UlpasoMeetingStartActionIdentifier
                                           title:startTitle
                                         options:UNNotificationActionOptionNone];
  UNNotificationAction *dismissAction =
      [UNNotificationAction actionWithIdentifier:UlpasoMeetingDismissActionIdentifier
                                           title:dismissTitle
                                         options:UNNotificationActionOptionNone];
  UNNotificationCategory *category =
      [UNNotificationCategory categoryWithIdentifier:UlpasoMeetingCategoryIdentifier
                                              actions:@[ startAction, dismissAction ]
                                    intentIdentifiers:@[]
                                              options:UNNotificationCategoryOptionCustomDismissAction];
  [center setNotificationCategories:[NSSet setWithObject:category]];

  UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
  content.title = title;
  content.body = body;
  content.categoryIdentifier = UlpasoMeetingCategoryIdentifier;
  content.sound = [UNNotificationSound defaultSound];

  UNNotificationRequest *request =
      [UNNotificationRequest requestWithIdentifier:UlpasoMeetingNotificationIdentifier
                                           content:content
                                           trigger:nil];
  [center removeDeliveredNotificationsWithIdentifiers:@[ UlpasoMeetingNotificationIdentifier ]];
  [center addNotificationRequest:request
           withCompletionHandler:^(NSError *error) {
             if (error != nil) {
               NSLog(@"Ulpaso could not schedule the meeting notification: %@", error);
               ulpaso_schedule_legacy_meeting_notification(title,
                                                            body,
                                                            startTitle,
                                                            dismissTitle);
             }
           }];
}

extern "C" void ulpaso_install_meeting_notification_handler(
    UlpasoMeetingNotificationCallback callback) {
  dispatch_async(dispatch_get_main_queue(), ^{
    gMeetingNotificationCallback = callback;
    if (gMeetingNotificationDelegate == nil) {
      gMeetingNotificationDelegate = [[UlpasoMeetingNotificationDelegate alloc] init];
    }
    [UNUserNotificationCenter currentNotificationCenter].delegate =
        gMeetingNotificationDelegate;
    [NSUserNotificationCenter defaultUserNotificationCenter].delegate =
        gMeetingNotificationDelegate;
  });
}

extern "C" void ulpaso_show_meeting_notification(const char *title,
                                                   const char *body,
                                                   const char *startTitle,
                                                   const char *dismissTitle) {
  NSString *notificationTitle = ulpaso_string(title);
  NSString *notificationBody = ulpaso_string(body);
  NSString *notificationStartTitle = ulpaso_string(startTitle);
  NSString *notificationDismissTitle = ulpaso_string(dismissTitle);

  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    if (settings.authorizationStatus == UNAuthorizationStatusDenied) {
      ulpaso_emit_meeting_notification_action("permission-denied");
      return;
    }
    if (settings.authorizationStatus == UNAuthorizationStatusNotDetermined) {
      [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert |
                                                UNAuthorizationOptionSound)
                            completionHandler:^(BOOL granted, NSError *error) {
                              if (!granted || error != nil) {
                                NSLog(@"Ulpaso notification permission was not granted: %@", error);
                                if (error != nil) {
                                  ulpaso_schedule_legacy_meeting_notification(
                                      notificationTitle,
                                      notificationBody,
                                      notificationStartTitle,
                                      notificationDismissTitle);
                                } else {
                                  ulpaso_emit_meeting_notification_action("permission-denied");
                                }
                                return;
                              }
                              ulpaso_schedule_meeting_notification(notificationTitle,
                                                                    notificationBody,
                                                                    notificationStartTitle,
                                                                    notificationDismissTitle);
                            }];
      return;
    }
    ulpaso_schedule_meeting_notification(notificationTitle,
                                          notificationBody,
                                          notificationStartTitle,
                                          notificationDismissTitle);
  }];
}

extern "C" void ulpaso_clear_meeting_notification(void) {
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center removePendingNotificationRequestsWithIdentifiers:@[ UlpasoMeetingNotificationIdentifier ]];
  [center removeDeliveredNotificationsWithIdentifiers:@[ UlpasoMeetingNotificationIdentifier ]];
  dispatch_async(dispatch_get_main_queue(), ^{
    NSUserNotificationCenter *legacyCenter =
        [NSUserNotificationCenter defaultUserNotificationCenter];
    for (NSUserNotification *delivered in legacyCenter.deliveredNotifications) {
      if ([delivered.identifier isEqualToString:UlpasoMeetingNotificationIdentifier]) {
        [legacyCenter removeDeliveredNotification:delivered];
      }
    }
  });
}

#pragma clang diagnostic pop
