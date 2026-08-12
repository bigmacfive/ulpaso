# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Ulpaso landing design decisions

- Preserve a white-first editorial direction: clean white, pale gray, charcoal, and black, with no paper tint or botanical color wash.
- Product UI and the Ulpaso waveform mark are the primary visual assets; avoid decorative color, photographic botanicals, and generic SaaS card grids.
- Use the repository's `public/logo.svg` for the website header, footer, and legal header. The website copy uses a tighter viewBox so its bird-shaped mark reads large inside a thin neutral-gray stroke; do not substitute the waveform or framed PNG icon.
- Exception for the browser tab icon: use the repository's exact `public/favicon.svg` asset, copied unchanged into `website/public/favicon.svg` and linked directly from `website/index.html`.
- Keep download and GitHub actions visible in the hero and closing section.
- Download actions use the stable `/download` route, which resolves the newest Apple Silicon DMG instead of opening the GitHub release listing. Use the exact macOS app icon from `src-tauri/icons/icon.png`, tilted slightly inside the download button; keep the button itself shadowless.
- The production site is deployed on Vercel with `ulpaso.app` as its canonical custom domain. Preserve the Vercel serverless `/download` endpoint and the static SPA/legal-page routing in `vercel.json`.
- Motion should stay quiet: line drawing, mask/reveal, and subtle product-window parallax with reduced-motion support.
- Decorative waveform imagery is rendered as generated high-resolution raster art built from ASCII-character textures. Use the real product screenshot as the visual source of truth, but keep the landing hero itself as a functional HTML app mock rather than a static screenshot.
- Use Goorm Sans for primary UI and reading text. HanYongUn may appear only in short handwritten notes or emotional pull quotes; never use it for navigation, legal body text, or dense information.
- The verified legal operator is `askitmore co., ltd`, while `askitmore` is the brand. Do not display a business registration identifier anywhere on the site. Keep `/legal`, `/privacy`, and `/terms` reachable from the landing footer.
- The selected landing direction is the headerless “continuous document” concept: begin with the oversized Ulpaso wordmark, not a navigation bar or bird-logo lockup.
- Keep the landing page structured as numbered editorial chapters: product, local-first principles, transcription before/after, open source, installation, and final CTA.
- Promote Ulpaso as free and open source in the hero CTA and open-source chapter without introducing pricing-card UI.
- Scroll motion should be restrained and one-shot: short fade/translate reveals plus a subtle waveform expansion, with reduced-motion support.
- The terminal panel must use the repository's real pnpm/Tauri development commands and provide a working copy action with visible success feedback.
- Do not mention or display botanical illustration assets; that direction is no longer part of the site.
- The hero app mock mirrors the actual app with the sidebar closed: a 28px title bar and centered editor surface. Keep the chrome static; only the in-editor meeting transcript and slash-command/code-block sequence animate in an automatic infinite loop.
- Use `https://ulpaso.app` as the canonical public origin. The repository's 1200×630 `public/og.png` is the exact social share card; copy it unchanged to `website/public/og.png` and use page-specific SEO metadata for `/`, `/legal`, `/privacy`, and `/terms`.
- The website supports English, Korean, and Japanese. Detect the browser language on first visit, persist an explicit choice under the same `ulpaso-locale` key as the app, and keep the compact language control in the footer.
