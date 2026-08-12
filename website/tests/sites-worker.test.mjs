import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("redirects the stable download route to the latest Apple Silicon DMG", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    assert.equal(input, "https://api.github.com/repos/bigmacfive/ulpaso/releases/latest");
    return Response.json({
      assets: [
        { name: "Ulpaso_0.2.1_aarch64.dmg", browser_download_url: "https://github.com/bigmacfive/ulpaso/releases/download/v0.2.1/Ulpaso_0.2.1_aarch64.dmg" },
      ],
    });
  };

  let assetCalls = 0;
  const response = await worker.fetch(new Request("https://ulpaso.app/download"), {
    ASSETS: { fetch: async () => { assetCalls += 1; return new Response("missing", { status: 404 }); } },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://github.com/bigmacfive/ulpaso/releases/download/v0.2.1/Ulpaso_0.2.1_aarch64.dmg");
  assert.equal(assetCalls, 0);
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("serves route-specific HTML for public legal pages", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://ulpaso.app/privacy?source=share", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response("privacy", { status: url.pathname === "/privacy/index.html" ? 200 : 404 });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/privacy/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(new URL("../dist/client/legal/index.html", import.meta.url));
  await access(new URL("../dist/client/privacy/index.html", import.meta.url));
  await access(new URL("../dist/client/terms/index.html", import.meta.url));
});

test("ships complete share metadata for every public page", async () => {
  const routes = [
    ["index.html", "https://ulpaso.app/", "Ulpaso — Private, on-device meeting notes in Markdown"],
    ["legal/index.html", "https://ulpaso.app/legal", "Operator and legal information — Ulpaso"],
    ["privacy/index.html", "https://ulpaso.app/privacy", "Privacy policy — Ulpaso"],
    ["terms/index.html", "https://ulpaso.app/terms", "Terms of use — Ulpaso"],
  ];

  for (const [file, canonical, title] of routes) {
    const html = await readFile(new URL(`../dist/client/${file}`, import.meta.url), "utf8");
    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    assert.ok(html.includes('<meta property="og:image" content="https://ulpaso.app/og.png"'));
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image"'));
    assert.ok(html.includes('<script id="seo-json-ld" type="application/ld+json">'));
  }
});

test("ships the exact 1200 by 630 social card and crawler files", async () => {
  const png = await readFile(new URL("../dist/client/og.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);

  const robots = await readFile(new URL("../dist/client/robots.txt", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../dist/client/sitemap.xml", import.meta.url), "utf8");
  assert.ok(robots.includes("Sitemap: https://ulpaso.app/sitemap.xml"));
  for (const route of ["https://ulpaso.app/", "https://ulpaso.app/legal", "https://ulpaso.app/privacy", "https://ulpaso.app/terms"]) {
    assert.ok(sitemap.includes(`<loc>${route}</loc>`));
  }
});
