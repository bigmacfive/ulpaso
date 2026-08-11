# Security policy

## Supported versions

Ulpaso is currently in early preview. Security fixes are applied to the latest `main` branch only.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature on this repository. Include:

- affected commit or version;
- reproduction steps or a proof of concept;
- expected impact;
- any suggested mitigation.

You should receive an acknowledgement within seven days. Please allow time for a fix before public disclosure.

## Security boundaries

Ulpaso opens and writes user-selected local Markdown files, captures local audio after macOS permission, and executes a bundled Python worker for on-device transcription. It does not intentionally expose a network server or upload document/audio contents. Model and runtime artifacts are downloaded over HTTPS from their documented upstream sources.

The project does not currently publish signed binaries. Source-built or unsigned apps inherit the trust and integrity of the local build environment.

CI audits JavaScript production dependencies and the Rust lockfile. RustSec
exceptions are pinned in `.cargo/audit.toml` with their dependency-path reason;
new warnings still fail CI and existing exceptions should be reconsidered on
every Tauri upgrade.
