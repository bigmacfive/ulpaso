fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=native/macos_audio_capture.mm");
        println!("cargo:rerun-if-changed=native/macos_window_shadow.mm");
        cc::Build::new()
            .cpp(true)
            .file("native/macos_audio_capture.mm")
            .file("native/macos_window_shadow.mm")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-std=c++17")
            .compile("ulpaso_audio_capture");

        for framework in [
            "AppKit",
            "AVFoundation",
            "AudioToolbox",
            "CoreAudio",
            "CoreMedia",
            "CoreVideo",
            "Foundation",
            "QuartzCore",
            "ScreenCaptureKit",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=dylib=c++");
    }

    tauri_build::build()
}
