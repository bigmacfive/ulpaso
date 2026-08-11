# macOS app icon

`macos-icon.svg` is generated deterministically from the approved mark at
`../../public/logo.svg`.

- Canvas: 1024 × 1024, transparent outside the icon tile
- Tile: 824 × 824 continuous-corner grayscale squircle
- Mark: original black vector paths, optically centered at 86% source scale
- Finish: low-contrast neutral surface, 1 px low-opacity keyline, diffuse macOS-style shadow
- Source generator: `pnpm icon:macos:source`
- macOS export: `pnpm icon:macos`

The source mark is never rasterized before the final platform exports.

The macOS export updates `icon.icns` plus the shared PNG sizes used by Tauri.
It intentionally leaves Windows, iOS, and Android platform assets untouched.
