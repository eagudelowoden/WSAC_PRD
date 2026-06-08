/**
 * middlewares/auth.js
 * Autenticación basada en JWT (cookie httpOnly "wsac_token").
 * Ya no depende de express-session ni de la tabla de sesiones MySQL.
 */
const jwt = require("jsonwebtoken");
const db  = require("../databases/knex");

const JWT_SECRET = process.env.JWT_SECRET || "Secret_WAS_Key_123";

// Permisos por defecto cuando no hay fila explícita en permisos_edicion
const DEFAULTS_MODULOS_POR_ROL = {
  aprobadorUno: { modulo_seleccion: true,  modulo_nomina: false, modulo_postulaciones: false, modulo_portal: false, modulo_requisiciones: false },
  aprobadorDos: { modulo_seleccion: false, modulo_nomina: true,  modulo_postulaciones: false, modulo_portal: false, modulo_requisiciones: false },
  jefe:         { modulo_seleccion: false, modulo_nomina: false, modulo_postulaciones: false, modulo_portal: true,  modulo_requisiciones: false },
};

// ── Helpers ─────────────────────────────────────────────────────
function leerToken(req) {
  return req.cookies?.wsac_token || null;
}

function decodificarToken(token) {
  return jwt.verify(token, JWT_SECRET); // lanza si inválido/expirado
}

// ── verificarAuth ────────────────────────────────────────────────
function verificarAuth(req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  const esAPI = req.originalUrl.startsWith("/api/");
  const token = leerToken(req);

  if (!token) {
    console.log(`🚫 Sin token: ${req.originalUrl}`);
    if (esAPI) return res.status(401).json({ status: "error", code: "auth_required" });
    return res.redirect("/login.html?error=auth_required");
  }

  try {
    req.user = decodificarToken(token);
    return next();
  } catch {
    res.clearCookie("wsac_token");
    console.log(`🚫 Token inválido: ${req.originalUrl}`);
    if (esAPI) return res.status(401).json({ status: "error", code: "auth_required" });
    return res.redirect("/login.html?error=auth_required");
  }
}

// ── verificarSuperAdmin ──────────────────────────────────────────
function verificarSuperAdmin(req, res, next) {
  const token = leerToken(req);
  if (!token) return res.redirect("/login.html?error=auth_required");

  try {
    req.user = decodificarToken(token);
    if (req.user.rol === "superadmin") return next();
    return res.redirect("/panel-administrativo");
  } catch {
    res.clearCookie("wsac_token");
    return res.redirect("/login.html?error=auth_required");
  }
}

// ── verificarModulo ──────────────────────────────────────────────
function verificarModulo(modulo) {
  return async (req, res, next) => {
    if (!req.user) return next();

    const { rol, id } = req.user;
    const esAPI       = req.originalUrl.startsWith("/api/");
    const defaults    = DEFAULTS_MODULOS_POR_ROL[rol] || {};

    const denegarAcceso = () => esAPI
      ? res.status(403).json({ status: "error", code: "sin_acceso" })
      : res.redirect("/login.html?error=sin_acceso");

    if (rol === "superadmin") return next();

    try {
      const [rows] = await db.raw(
        "SELECT CAST(puede_editar AS UNSIGNED) AS puede_editar FROM permisos_edicion WHERE usuario_id = ? AND seccion = ? LIMIT 1",
        [id, modulo],
      );

      if (rows?.length > 0) {
        const val      = rows[0].puede_editar;
        const permitido = val === 1 || val === true || val === "1";
        if (permitido || defaults[modulo]) return next();
        return denegarAcceso();
      }

      if (defaults[modulo]) return next();
      return denegarAcceso();
    } catch {
      if (defaults[modulo]) return next();
      return denegarAcceso();
    }
  };
}

// ── registrarActividad ───────────────────────────────────────────
function registrarActividad(accion) {
  return async (req, res, next) => {
    if (!req.user) return next();

    const { id, nombre, rol } = req.user;
    const bodyCopy = req.body ? { ...req.body } : { info: "No body data" };
    if (bodyCopy.password) bodyCopy.password = "********";

    try {
      await db("logs_sistema").insert({
        usuario_id    : id      || 0,
        nombre_usuario: nombre  || "Anónimo",
        rol           : rol     || "Sin Rol",
        accion        : accion  || "Acción",
        metodo_http   : req.method,
        ruta_api      : req.originalUrl,
        detalles      : JSON.stringify(bodyCopy),
      });
    } catch (err) {
      console.error("❌ LOG fallido:", err.message);
    }

    next();
  };
}

module.exports = {
  verificarAuth,
  verificarSuperAdmin,
  verificarModulo,
  registrarActividad,
  DEFAULTS_MODULOS_POR_ROL,
  JWT_SECRET,
};
