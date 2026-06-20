const { Server } = require("socket.io");
const db = require("../databases/knex");

function initSockets(server, serverID) {
  const io = new Server(server);

  io.on("connection", (socket) => {
    socket.emit("version-actual", serverID);

    db.raw(
      "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1",
    )
      .then(([rows]) => {
        if (rows.length > 0) socket.emit("mantenimiento", rows[0]);
      })
      .catch(() => {});

    socket.on("disconnect", () => {});
  });

  return io;
}

module.exports = { initSockets };
