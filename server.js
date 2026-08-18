const { server, serverID } = require("./app");

const PORT = process.env.PORT || 3005;
const URL_BASEDEV = process.env.URL_BASEDEV;

server.listen(PORT, () => {
  console.log(`\n--- WSAC SYSTEM DEBUG ---`);
  console.log(`🚀 Servidor y WebSockets activos en: ${URL_BASEDEV}`);
  console.log(`🆔 Version ID actual: ${serverID}`);
  console.log(`📦 Puerto: ${PORT}`);
  console.log(`--------------------------\n`);
});
