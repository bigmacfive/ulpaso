#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSeo, getStructuredData } from "../src/seo.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function replaceMeta(html, attribute, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(<meta ${attribute}="${escapedKey}" content=")[^"]*(" \\/>)`);
  return html.replace(pattern, `$1${escapeAttribute(value)}$2`);
}

function renderRouteHtml(source, route) {
  const seo = getSeo(route, "en");
  let html = source.replace(/<title>[^<]*<\/title>/, `<title>${seo.title}</title>`);
  html = replaceMeta(html, "name", "description", seo.description);
  html = replaceMeta(html, "property", "og:title", seo.title);
  html = replaceMeta(html, "property", "og:description", seo.description);
  html = replaceMeta(html, "property", "og:url", seo.canonical);
  html = replaceMeta(html, "name", "twitter:title", seo.title);
  html = replaceMeta(html, "name", "twitter:description", seo.description);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${seo.canonical}$2`);
  const jsonLd = JSON.stringify(getStructuredData(route, "en")).replaceAll("<", "\\u003c");
  html = html.replace(/(<script id="seo-json-ld" type="application\/ld\+json">)[\s\S]*?(<\/script>)/, `$1${jsonLd}$2`);
  return html;
}

const sourceHtml = readFileSync(index, "utf8");
for (const route of ["/legal", "/privacy", "/terms"]) {
  const routeDirectory = path.join(dist, "client", route.slice(1));
  mkdirSync(routeDirectory, { recursive: true });
  writeFileSync(path.join(routeDirectory, "index.html"), renderRouteHtml(sourceHtml, route));
}

console.log("Prepared Sites build with route-specific SEO pages and hosting files");
