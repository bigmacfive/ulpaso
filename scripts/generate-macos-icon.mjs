import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "public/logo.svg");
const outputPath = resolve(root, "src-tauri/icon-source/macos-icon.svg");
const tauriSourcePath = resolve(root, "src-tauri/icon.svg");
const source = readFileSync(sourcePath, "utf8");

const markPaths = [...source.matchAll(/<path\b[^>]*\bfill="black"[^>]*\/>/g)].map(([path]) => path);
if (markPaths.length < 10) {
  throw new Error(`Expected the Ulpaso mark in ${sourcePath}, found ${markPaths.length} paths.`);
}

const tilePath = [
  "M512 88",
  "C754 88 824 88 874 138",
  "C924 188 924 258 924 500",
  "C924 742 924 812 874 862",
  "C824 912 754 912 512 912",
  "C270 912 200 912 150 862",
  "C100 812 100 742 100 500",
  "C100 258 100 188 150 138",
  "C200 88 270 88 512 88Z",
].join(" ");

const icon = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="512" y1="88" x2="512" y2="912" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.56" stop-color="#FAFAFB"/>
      <stop offset="1" stop-color="#EFF0F2"/>
    </linearGradient>
    <filter id="tileShadow" x="24" y="12" width="976" height="988" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000000" flood-opacity="0.105"/>
      <feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="#000000" flood-opacity="0.035"/>
    </filter>
    <clipPath id="tileClip">
      <path d="${tilePath}"/>
    </clipPath>
  </defs>
  <path d="${tilePath}" fill="url(#tile)" filter="url(#tileShadow)"/>
  <g clip-path="url(#tileClip)">
    <g transform="translate(-27.22 -39.22) scale(0.86)">
      ${markPaths.join("\n      ")}
    </g>
  </g>
  <path d="${tilePath}" stroke="#000000" stroke-width="1" opacity="0.028"/>
</svg>
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, icon);
writeFileSync(tauriSourcePath, icon);
console.log(`Generated ${outputPath} and ${tauriSourcePath}`);
