import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function latestMacDownload() {
  return {
    name: "latest-mac-download",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname.replace(/\/+$/, "") || "/";
        if (pathname !== "/download" || !["GET", "HEAD"].includes(request.method)) return next();

        try {
          const releaseResponse = await fetch("https://api.github.com/repos/bigmacfive/ulpaso/releases/latest", {
            headers: {
              accept: "application/vnd.github+json",
              "user-agent": "ulpaso-local-preview",
            },
          });
          if (!releaseResponse.ok) throw new Error(`GitHub release lookup failed: ${releaseResponse.status}`);
          const release = await releaseResponse.json();
          const asset = release.assets?.find(({ name }) => /^Ulpaso_.*_aarch64\.dmg$/.test(name));
          if (!asset?.browser_download_url) throw new Error("Apple Silicon DMG not found");
          response.statusCode = 302;
          response.setHeader("Location", asset.browser_download_url);
          response.setHeader("Cache-Control", "public, max-age=300");
          response.end();
        } catch {
          response.statusCode = 302;
          response.setHeader("Location", "https://github.com/bigmacfive/ulpaso/releases/latest");
          response.end();
        }
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [latestMacDownload(), react()],
});
