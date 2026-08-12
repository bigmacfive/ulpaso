const LATEST_RELEASE_API = "https://api.github.com/repos/bigmacfive/ulpaso/releases/latest";
const RELEASES_FALLBACK = "https://github.com/bigmacfive/ulpaso/releases/latest";

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
    const releaseResponse = await fetch(LATEST_RELEASE_API, {
      cache: "no-store",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "ulpaso-download-redirect",
      },
    });
    if (!releaseResponse.ok) throw new Error(`GitHub release lookup failed: ${releaseResponse.status}`);

    const release = await releaseResponse.json();
    const asset = release.assets?.find(({ name }) => /^Ulpaso_.*_aarch64\.dmg$/.test(name));
    if (!asset?.browser_download_url) throw new Error("Apple Silicon DMG not found");

    return response.redirect(302, asset.browser_download_url);
  } catch {
    return response.redirect(302, RELEASES_FALLBACK);
  }
}
