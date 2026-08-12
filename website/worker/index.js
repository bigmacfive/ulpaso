export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";

    if (normalizedPath === "/download" && ["GET", "HEAD"].includes(request.method)) {
      try {
        const releaseResponse = await fetch("https://api.github.com/repos/bigmacfive/ulpaso/releases/latest", {
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": "ulpaso-download-redirect",
          },
        });
        if (!releaseResponse.ok) throw new Error(`GitHub release lookup failed: ${releaseResponse.status}`);
        const release = await releaseResponse.json();
        const asset = release.assets?.find(({ name }) => /^Ulpaso_.*_aarch64\.dmg$/.test(name));
        if (!asset?.browser_download_url) throw new Error("Apple Silicon DMG not found");
        return new Response(null, {
          status: 302,
          headers: {
            location: asset.browser_download_url,
            "cache-control": "public, max-age=300, s-maxage=300",
          },
        });
      } catch {
        return Response.redirect("https://github.com/bigmacfive/ulpaso/releases/latest", 302);
      }
    }

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    const isDocumentRequest = acceptsHtml && ["GET", "HEAD"].includes(request.method);

    if (isDocumentRequest && ["/legal", "/privacy", "/terms"].includes(normalizedPath)) {
      const routeUrl = new URL(request.url);
      routeUrl.pathname = `${normalizedPath}/index.html`;
      routeUrl.search = "";
      const routeResponse = await env.ASSETS.fetch(new Request(routeUrl, request));
      if (routeResponse.status !== 404) return routeResponse;
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404 || !isDocumentRequest) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
