# Roadmap

Ulpaso keeps the roadmap small enough that outside contributors can tell what is
actually actionable.

## Release readiness

- Publish the first unsigned Apple Silicon prerelease from the automated tag
  workflow and verify its checksum on a second Mac.
- Run the native device matrix in `docs/RELEASE.md` for every release candidate.
- Add code signing and notarization when project distribution warrants an Apple
  Developer account.

## Reusable foundations

- Publish `@ulpaso/markdown` after its API has survived one preview cycle.
- Stabilize and version the meeting worker protocol documented in
  `docs/MEETING_PROTOCOL.md`.
- Extract transcript cleanup and model inference backends into smaller Python
  modules without changing the framed protocol.

## Good first contributions

- Add a syntax language to the explicit highlight.js registry and a rendering
  fixture.
- Add Markdown round-trip fixtures for real-world GFM edge cases.
- Improve English or Japanese copy while updating all locale completeness tests.
- Add a benchmark fixture for a non-English public-domain recording.

Platform expansion is welcome only with an owned native capture implementation;
the browser editor already works cross-platform, but Ulpaso will not claim full
Windows or Linux meeting support based on untested stubs.
