import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import handler from "../api/download.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function responseRecorder() {
  return {
    headers: new Map(),
    statusCode: null,
    redirectCode: null,
    redirectUrl: null,
    ended: false,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
    redirect(code, url) {
      this.redirectCode = code;
      this.redirectUrl = url;
      return this;
    },
  };
}

test("redirects downloads using the latest update manifest", async () => {
  let requestUrl;
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      async json() {
        return { version: "0.2.2" };
      },
    };
  };
  const response = responseRecorder();

  await handler({ method: "GET" }, response);

  assert.equal(response.redirectCode, 302);
  assert.equal(
    response.redirectUrl,
    "https://github.com/bigmacfive/ulpaso/releases/download/v0.2.2/Ulpaso_0.2.2_aarch64.dmg",
  );
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "public, s-maxage=60");
  assert.equal(requestUrl, "https://github.com/bigmacfive/ulpaso/releases/latest/download/latest.json");
  assert.equal(requestOptions.cache, "no-store");
  assert.equal(requestOptions.headers.accept, "application/json");
});

test("supports HEAD checks without pinning a release in the landing page", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { version: "1.0.0" };
    },
  });
  const response = responseRecorder();

  await handler({ method: "HEAD" }, response);

  assert.equal(
    response.redirectUrl,
    "https://github.com/bigmacfive/ulpaso/releases/download/v1.0.0/Ulpaso_1.0.0_aarch64.dmg",
  );
});

test("falls back to the latest release page when GitHub lookup fails", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  const response = responseRecorder();

  await handler({ method: "GET" }, response);

  assert.equal(response.redirectCode, 302);
  assert.equal(response.redirectUrl, "https://github.com/bigmacfive/ulpaso/releases/latest");
});

test("falls back when the manifest version is invalid", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { version: "../../unexpected" };
    },
  });
  const response = responseRecorder();

  await handler({ method: "GET" }, response);

  assert.equal(response.redirectCode, 302);
  assert.equal(response.redirectUrl, "https://github.com/bigmacfive/ulpaso/releases/latest");
});

test("rejects methods that cannot download a release", async () => {
  const response = responseRecorder();

  await handler({ method: "POST" }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(response.ended, true);
});
