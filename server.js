// server.js
import Hapi from "@hapi/hapi";
import Parser from "@postlight/parser";

const DEFAULT_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 30000);

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
    routes: {
      cors: {
        origin: ["*"],
        additionalHeaders: ["cache-control"],
      },
      timeout: {
        server: false, // biar hapi gak motong request lama
        socket: false,
      },
    },
  });

  server.route({
    method: "GET",
    path: "/health",
    handler: (request, h) => {
      return h
        .response({
          ok: true,
          time: new Date().toISOString(),
        })
        .code(200);
    },
  });

  server.route({
    method: "GET",
    path: "/parse",
    handler: async (request, h) => {
      const url = request.query.url;

      console.log(`[${new Date().toISOString()}] GET /parse`, {
        url,
        ip: request.info.remoteAddress,
        userAgent: request.headers["user-agent"],
      });

      if (!url) {
        console.log(`[${new Date().toISOString()}] 400 missing url param`);
        return h.response({ error: "Parameter ?url= wajib ada" }).code(400);
      }

      const start = Date.now();

      try {
        console.log(`[${new Date().toISOString()}] fetching start`, {
          url,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          DEFAULT_TIMEOUT_MS
        );

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

        clearTimeout(timeout);

        console.log(`[${new Date().toISOString()}] fetching done`, {
          url,
          status: res.status,
          ok: res.ok,
        });

        if (!res.ok) {
          const ms = Date.now() - start;
          console.log(`[${new Date().toISOString()}] fetch not ok`, {
            url,
            ms,
            status: res.status,
          });
          return h.response({ error: `Fetch failed: ${res.status}` }).code(502);
        }

        const html = await res.text();

        console.log(`[${new Date().toISOString()}] parsing start`, {
          url,
          htmlLength: html.length,
        });

        // Parser.parse(url, { html }) -> parse HTML yang sudah kita fetch
        const result = await Parser.parse(url, { html });

        const ms = Date.now() - start;
        console.log(`[${new Date().toISOString()}] parsing success`, {
          url,
          ms,
          title: result?.title,
          contentLength: result?.content?.length ?? 0,
        });

        return h.response(result).code(200);
      } catch (err) {
        const ms = Date.now() - start;
        const name = err?.name;
        const message = err?.message;

        console.error(`[${new Date().toISOString()}] parsing error`, {
          url,
          ms,
          name,
          message,
          stack: err?.stack,
        });

        // AbortError biasanya timeout dari fetch AbortController
        if (name === "AbortError") {
          return h
            .response({ error: "Timeout while fetching target URL" })
            .code(504);
        }

        return h.response({ error: message || "Internal error" }).code(500);
      }
    },
  });

  await server.start();
  console.log(
    `[${new Date().toISOString()}] Server running on ${server.info.uri}`
  );
  console.log(
    `[${new Date().toISOString()}] Config: FETCH_TIMEOUT_MS=${DEFAULT_TIMEOUT_MS}`
  );
};

init();
