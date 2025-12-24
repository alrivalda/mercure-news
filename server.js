// server.js
import Hapi from "@hapi/hapi";
import Parser from "@postlight/parser";

const DEFAULT_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30000);
const STRICT_HTTP = String(process.env.STRICT_HTTP || "0") === "1";
// STRICT_HTTP=1 => kalau fetch non-2xx, tetap return 502 (mode lama)
// STRICT_HTTP=0 => return 200 dengan ok:false (recommended buat n8n batch)

function now() {
  return new Date().toISOString();
}

function pickHeaders(headers) {
  // headers bisa beda implementasi, jadi aman-aman aja
  const get = (k) => {
    try {
      return headers.get(k);
    } catch {
      return undefined;
    }
  };
  return {
    "content-type": get("content-type"),
    server: get("server"),
    "cf-ray": get("cf-ray"),
    "cf-cache-status": get("cf-cache-status"),
    location: get("location"),
  };
}

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
    routes: {
      cors: { origin: ["*"] },
      timeout: { server: false, socket: false },
    },
  });

  server.route({
    method: "GET",
    path: "/health",
    handler: (request, h) => h.response({ ok: true, time: now() }).code(200),
  });

  server.route({
    method: "GET",
    path: "/parse",
    handler: async (request, h) => {
      const url = request.query.url;

      console.log(`[${now()}] GET /parse`, {
        url,
        ip: request.info.remoteAddress,
        ua: request.headers["user-agent"],
      });

      if (!url) {
        return h
          .response({ ok: false, error: "Parameter ?url= wajib ada" })
          .code(400);
      }

      const start = Date.now();

      try {
        console.log(`[${now()}] fetching start`, {
          url,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        const res = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
          },
        });

        clearTimeout(t);

        const msFetch = Date.now() - start;

        console.log(`[${now()}] fetching done`, {
          url,
          status: res.status,
          ok: res.ok,
          ms: msFetch,
          headers: pickHeaders(res.headers),
        });

        // kalau non-2xx: ambil sedikit body biar keliatan blocked/rate-limited
        if (!res.ok) {
          let snippet = "";
          try {
            const text = await res.text();
            snippet = (text || "").slice(0, 600);
          } catch {}

          const payload = {
            ok: false,
            url,
            fetch: {
              status: res.status,
              statusText: res.statusText,
              headers: pickHeaders(res.headers),
              bodySnippet: snippet,
            },
            hint: "Target site returned non-2xx (often 403/429/451/503). Possible anti-bot, rate limit, geo-block, or datacenter IP block.",
          };

          if (STRICT_HTTP) return h.response(payload).code(502);
          return h.response(payload).code(200);
        }

        const html = await res.text();

        console.log(`[${now()}] parsing start`, {
          url,
          htmlLength: html.length,
        });

        const result = await Parser.parse(url, { html });

        const msTotal = Date.now() - start;

        console.log(`[${now()}] parsing success`, {
          url,
          ms: msTotal,
          title: result?.title,
          contentLength: result?.content?.length ?? 0,
        });

        return h.response({ ok: true, url, result }).code(200);
      } catch (err) {
        const ms = Date.now() - start;

        console.error(`[${now()}] parsing error`, {
          url,
          ms,
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
        });

        if (err?.name === "AbortError") {
          const payload = {
            ok: false,
            url,
            error: "Timeout while fetching target URL",
          };
          if (STRICT_HTTP) return h.response(payload).code(504);
          return h.response(payload).code(200);
        }

        const payload = {
          ok: false,
          url,
          error: err?.message || "Internal error",
        };
        if (STRICT_HTTP) return h.response(payload).code(500);
        return h.response(payload).code(200);
      }
    },
  });

  await server.start();
  console.log(`[${now()}] Server running on ${server.info.uri}`);
  console.log(
    `[${now()}] Config: FETCH_TIMEOUT_MS=${DEFAULT_TIMEOUT_MS}, STRICT_HTTP=${STRICT_HTTP}`
  );
};

init();
