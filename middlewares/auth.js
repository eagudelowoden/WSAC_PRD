const db = require("../databases/db");

function verificarAuth(req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  if (req.session && req.session.usuario && req.session.tokenSeguridad) {
    const ahora = Date.now();
    const diferencia = ahora - (req.session.lastActivity || ahora);

    if (diferencia > 30 * 60 * 1000) {
      return req.session.destroy(() => {
        res.redirect("/login.html?error=sesion_expirada");
      });
    }

    req.session.lastActivity = ahora;
    return next();
  }

  console.log(`🚫 Acceso denegado a ruta: ${req.originalUrl}`);
  res.redirect("/login.html?error=auth_required");
}

function verificarSuperAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.rol === "superadmin") next();
  else res.redirect("/panel-administrativo");
}

function registrarActividad(accion) {
  return (req, res, next) => {
    if (req.session && req.session.usuario) {
      const { id, nombre, rol } = req.session.usuario;
      const sql = `
        INSERT INTO logs_sistema (usuario_id, nombre_usuario, rol, accion, metodo_http, ruta_api, detalles)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const bodyCopy = { ...req.body };
      if (bodyCopy.password) bodyCopy.password = "********";

      db.query(
        sql,
        [
          id,
          nombre,
          rol,
          accion,
          req.method,
          req.originalUrl,
          JSON.stringify(bodyCopy),
        ],
        (err) => {
          if (err) console.error("⚠️ Error en log de auditoría:", err.message);
        },
      );
    }
    next();
  };
}

module.exports = { verificarAuth, verificarSuperAdmin, registrarActividad };
