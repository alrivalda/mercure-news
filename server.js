import Hapi from "@hapi/hapi";
import Parser from "@postlight/parser";

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: "0.0.0.0",
  });

  // Route: parse multiple URLs
  server.route({
    method: "POST",
    path: "/parse",
    options: {
      payload: {
        parse: true,
        allow: "application/json",
      },
    },
    handler: async (request, h) => {
      const { urls } = request.payload || {};

      if (!urls || !Array.isArray(urls)) {
        return h
          .response({ error: "`urls` harus berupa array di dalam body JSON" })
          .code(400);
      }

      try {
        const results = [];

        for (const url of urls) {
          try {
            const parsed = await Parser.parse(url);
            results.push({
              url,
              success: true,
              data: parsed,
            });
          } catch (err) {
            results.push({
              url,
              success: false,
              error: err.message,
            });
          }
        }

        return h.response({ results }).code(200);
      } catch (err) {
        return h.response({ error: err.message }).code(500);
      }
    },
  });

  await server.start();
  console.log("Server running on", server.info.uri);
};

init();
