#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>

constexpr CGFloat kShadowMargin = 30.0;
constexpr CGFloat kCornerRadius = 10.0;

@interface UlpasoWindowShadowController : NSObject
@property(nonatomic, weak) NSWindow *parentWindow;
@property(nonatomic, strong) NSWindow *shadowWindow;
@property(nonatomic, strong) CALayer *shadowLayer;
@property(nonatomic, strong) NSArray<id> *observers;
- (instancetype)initWithParentWindow:(NSWindow *)parentWindow;
- (void)updateFrame;
@end

@implementation UlpasoWindowShadowController

- (instancetype)initWithParentWindow:(NSWindow *)parentWindow {
  self = [super init];
  if (!self) return nil;

  _parentWindow = parentWindow;
  _shadowWindow = [[NSWindow alloc]
      initWithContentRect:NSZeroRect
                styleMask:NSWindowStyleMaskBorderless
                  backing:NSBackingStoreBuffered
                    defer:NO];
  _shadowWindow.opaque = NO;
  _shadowWindow.backgroundColor = NSColor.clearColor;
  _shadowWindow.hasShadow = NO;
  _shadowWindow.ignoresMouseEvents = YES;
  _shadowWindow.releasedWhenClosed = NO;
  _shadowWindow.collectionBehavior =
      NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle;

  NSView *contentView = [[NSView alloc] initWithFrame:NSZeroRect];
  contentView.wantsLayer = YES;
  contentView.layer.backgroundColor = NSColor.clearColor.CGColor;

  _shadowLayer = [CALayer layer];
  _shadowLayer.backgroundColor = [NSColor colorWithWhite:0.0 alpha:0.002].CGColor;
  _shadowLayer.cornerRadius = kCornerRadius;
  _shadowLayer.shadowColor = NSColor.blackColor.CGColor;
  _shadowLayer.shadowOpacity = 0.17;
  _shadowLayer.shadowRadius = 15.0;
  _shadowLayer.shadowOffset = CGSizeMake(0.0, -3.0);
  _shadowLayer.masksToBounds = NO;
  [contentView.layer addSublayer:_shadowLayer];
  _shadowWindow.contentView = contentView;

  [parentWindow addChildWindow:_shadowWindow ordered:NSWindowBelow];

  __weak UlpasoWindowShadowController *weakSelf = self;
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  NSMutableArray<id> *observers = [NSMutableArray array];
  for (NSNotificationName name in @[
         NSWindowDidMoveNotification,
         NSWindowDidResizeNotification,
         NSWindowDidChangeScreenNotification,
         NSWindowDidExitFullScreenNotification,
       ]) {
    [observers addObject:[center
        addObserverForName:name
                    object:parentWindow
                     queue:NSOperationQueue.mainQueue
                usingBlock:^(__unused NSNotification *notification) {
                  [weakSelf updateFrame];
                }]];
  }
  [observers addObject:[center
      addObserverForName:NSWindowDidEnterFullScreenNotification
                  object:parentWindow
                   queue:NSOperationQueue.mainQueue
              usingBlock:^(__unused NSNotification *notification) {
                [weakSelf.shadowWindow orderOut:nil];
              }]];
  _observers = observers;

  [self updateFrame];
  return self;
}

- (void)updateFrame {
  NSWindow *parentWindow = self.parentWindow;
  if (!parentWindow || (parentWindow.styleMask & NSWindowStyleMaskFullScreen)) {
    [self.shadowWindow orderOut:nil];
    return;
  }

  NSRect parentFrame = parentWindow.frame;
  NSRect shadowFrame = NSInsetRect(parentFrame, -kShadowMargin, -kShadowMargin);
  [self.shadowWindow setFrame:shadowFrame display:NO];

  NSView *contentView = self.shadowWindow.contentView;
  self.shadowLayer.frame = NSInsetRect(contentView.bounds, kShadowMargin, kShadowMargin);
  self.shadowLayer.shadowPath =
      [NSBezierPath bezierPathWithRoundedRect:self.shadowLayer.bounds
                                      xRadius:kCornerRadius
                                      yRadius:kCornerRadius]
          .CGPath;
  self.shadowWindow.level = parentWindow.level;
  [self.shadowWindow orderWindow:NSWindowBelow relativeTo:parentWindow.windowNumber];
}

- (void)dealloc {
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  for (id observer in self.observers) [center removeObserver:observer];
}

@end

static UlpasoWindowShadowController *gWindowShadowController = nil;

extern "C" void ulpaso_install_window_shadow(void *windowPointer) {
  NSWindow *window = (__bridge NSWindow *)windowPointer;
  if (!window) return;
  gWindowShadowController =
      [[UlpasoWindowShadowController alloc] initWithParentWindow:window];
}
