const db = require("../databases/db");

// Defaults de módulos por rol cuando no hay permisos explícitos en DB
const DEFAULTS_MODULOS_POR_ROL = {
  aprobadorUno: { modulo_seleccion: true,  modulo_nomina: false, modulo_postulaciones: false, modulo_portal: false, modulo_requisiciones: false },
  aprobadorDos: { modulo_seleccion: false, modulo_nomina: true,  modulo_postulaciones: false, modulo_portal: false, modulo_requisiciones: false },
  jefe:         { modulo_seleccion: false, modulo_nomina: false, modulo_postulaciones: false, modulo_portal: true,  modulo_requisiciones: false },
};

function verificarAuth(req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  const esAPI = req.originalUrl.startsWith("/api/");

  if (req.session && req.session.usuario && req.session.tokenSeguridad) {
    const ahora = Date.now();
    const diferencia = ahora - (req.session.lastActivity || ahora);

    if (diferencia > 30 * 60 * 1000) {
      return req.session.destroy(() => {
        if (esAPI) return res.status(401).json({ status: "error", code: "sesion_expirada" });
        res.redirect("/login.html?error=sesion_expirada");
      });
    }

    req.session.lastActivity = ahora;
    return next();
  }

  console.log(`🚫 Acceso denegado a ruta: ${req.originalUrl}`);
  if (esAPI) return res.status(401).json({ status: "error", code: "auth_required" });
  res.redirect("/login.html?error=auth_required");
}

function verificarSuperAdmin(req, res, next) {
  if (req.session.usuario && req.session.usuario.rol === "superadmin") next();
  else res.redirect("/panel-administrativo");
}

/**
 * Middleware para registrar actividades en el log del sistema.
 * Soporta peticiones POST, PUT y DELETE.
 */
function registrarActividad(accion) {
  return (req, res, next) => {
    // LOG DE DEPURACIÓN
    console.log(`--- Intento de Registro: ${accion} ---`);
    console.log(`Método: ${req.method} | URL: ${req.originalUrl}`);

    if (!req.session || !req.session.usuario) {
      console.error(
        "❌ LOG FALLIDO: No hay sesión de usuario en esta petición",
      );
      return next(); // Seguimos con la ruta, pero ya sabemos por qué no registró
    }

    const { id, nombre, rol } = req.session.usuario;
    const sql = `
      INSERT INTO logs_sistema (usuario_id, nombre_usuario, rol, accion, metodo_http, ruta_api, detalles)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // Evitamos que req.body sea undefined
    const bodyCopy = req.body ? { ...req.body } : { info: "No body data" };
    if (bodyCopy.password) bodyCopy.password = "********";

    db.query(
      sql,
      [
        id || 0, // Si el ID falla, que envíe 0
        nombre || "Anónimo", // Si el nombre falla
        rol || "Sin Rol",
        accion || "Acción",
        req.method,
        req.originalUrl,
        JSON.stringify(bodyCopy),
      ],
      (err) => {
        if (err) {
          console.error("❌ ERROR DB EN LOG:", err.message);
        } else {
          console.log("✅ LOG REGISTRADO EXITOSAMENTE");
        }
      },
    );

    next();
  };
}

function verificarModulo(modulo) {
  return (req, res, next) => {
    if (!req.session?.usuario) return next();

    const { rol, id } = req.session.usuario;

    if (rol === "superadmin") return next();

    const esAPI = req.originalUrl.startsWith("/api/");
    const denegarAcceso = () => esAPI
      ? res.status(403).json({ status: "error", code: "sin_acceso" })
      : res.redirect("/login.html?error=sin_acceso");

    db.query(
      "SELECT CAST(puede_editar AS UNSIGNED) AS puede_editar FROM permisos_edicion WHERE usuario_id = ? AND seccion = ? LIMIT 1",
      [id, modulo],
      (err, results) => {
        // Defaults del rol (siempre se evalúan como red de seguridad)
        const defaults = DEFAULTS_MODULOS_POR_ROL[rol] || {};

        if (err) {
          if (defaults[modulo]) return next();
          return denegarAcceso();
        }

        if (results && results.length > 0) {
          const val = results[0].puede_editar;
          const permitido = val === 1 || val === true || val === "1";
          if (permitido || defaults[modulo]) return next();
          return denegarAcceso();
        }

        if (defaults[modulo]) return next();
        return denegarAcceso();
      },
    );
  };
}

module.exports = { verificarAuth, verificarSuperAdmin, verificarModulo, registrarActividad, DEFAULTS_MODULOS_POR_ROL };
