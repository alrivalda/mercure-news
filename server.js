import Hapi from "@hapi/hapi";
import Parser from "@postlight/parser";

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  });

  server.route({
    method: "GET",
    path: "/parse",
    handler: async (request, h) => {
      const url = request.query.url;

      // log incoming request
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
        console.log(`[${new Date().toISOString()}] parsing start`, { url });

        const result = await Parser.parse(url);

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
        console.error(`[${new Date().toISOString()}] parsing error`, {
          url,
          ms,
          message: err?.message,
          stack: err?.stack,
        });

        return h
          .response({ error: err?.message || "Internal error" })
          .code(500);
      }
    },
  });

  await server.start();
  console.log(
    `[${new Date().toISOString()}] Server running on ${server.info.uri}`
  );
};

init();
