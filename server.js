import Hapi from '@hapi/hapi';
import Parser from '@postlight/parser';

// Create server
const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: '0.0.0.0'
  });

  // Route: parse URL
  server.route({
    method: 'GET',
    path: '/parse',
    handler: async (request, h) => {
      const url = request.query.url;

      if (!url) {
        return h.response({ error: 'Parameter ?url= wajib ada' }).code(400);
      }

      try {
        const result = await Parser.parse(url);
        return h.response(result).code(200);
      } catch (err) {
        return h.response({ error: err.message }).code(500);
      }
    }
  });

  await server.start();
  console.log('Server running on', server.info.uri);
};

init();
