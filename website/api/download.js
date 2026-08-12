const LATEST_MANIFEST = "https://github.com/bigmacfive/ulpaso/releases/latest/download/latest.json";
const RELEASES_FALLBACK = "https://github.com/bigmacfive/ulpaso/releases/latest";
const RELEASE_DOWNLOAD_ROOT = "https://github.com/bigmacfive/ulpaso/releases/download";

export default async function handler(request, response) {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    return response.status(405).end();
  }

  // Browsers must resolve the redirect again on every click. Vercel's edge
  // may share the GitHub lookup briefly so a release update propagates within
  // one minute without turning every download into an API request.
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=60");

  try {
    const manifestResponse = await fetch(LATEST_MANIFEST, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "ulpaso-download-redirect",
      },
    });
    if (!manifestResponse.ok) throw new Error(`Latest manifest lookup failed: ${manifestResponse.status}`);

    const manifest = await manifestResponse.json();
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")) {
      throw new Error("Latest manifest has an invalid version");
    }

    const tag = `v${manifest.version}`;
    const dmg = `Ulpaso_${manifest.version}_aarch64.dmg`;
    return response.redirect(302, `${RELEASE_DOWNLOAD_ROOT}/${tag}/${dmg}`);
  } catch {
    return response.redirect(302, RELEASES_FALLBACK);
  }
}
