const express    = require("express");
const router     = express.Router();
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcrypt");
const db         = require("../databases/knex");
const { verificarAuth, DEFAULTS_MODULOS_POR_ROL, JWT_SECRET } = require("../middlewares/auth");

// Opciones de la cookie JWT (reutilizables)
const COOKIE_OPTS = {
  httpOnly: true,
  secure  : process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge  : 8 * 60 * 60 * 1000, // 8 horas
};

// ── LOGIN ────────────────────────────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { usuario, password } = req.body;
    const [users] = await db.raw("SELECT * FROM usuariosSys WHERE usuario = ?", [usuario]);

    if (!users.length)
      return res.status(401).json({ status: "error", message: "Usuario no encontrado" });

    const user    = users[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(401).json({ status: "error", message: "Contraseña incorrecta" });

    const payload = { id: user.id, nombre: user.nombre, rol: user.rol };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });

    res.cookie("wsac_token", token, COOKIE_OPTS);

    // Redirigir según rol
    let redirectUrl = "/panel-administrativo";
    if (user.rol === "superadmin")   redirectUrl = "/superadmin";
    else if (user.rol === "aprobadorDos") redirectUrl = "/panel-aprobacionesDos";
    else if (user.rol === "jefe")    redirectUrl = "/portal/inicio";

    const redirectParam = req.body.redirect || req.query.redirect || null;
    if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
      redirectUrl = redirectParam;
    }

    const ticketAcceso = require("crypto").randomBytes(16).toString("hex");
    return res.json({
      status  : "ok",
      message : "Bienvenido",
      usuario : payload,
      redirect: `${redirectUrl}?s=${ticketAcceso}`,
    });
  } catch (err) {
    next(err);
  }
});

// ── LOGOUT ───────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
  res.clearCookie("wsac_token", { path: "/" });
  res.json({ status: "ok", message: "Sesión cerrada" });
});

// ── CHECK VERSION ────────────────────────────────────────────────
router.get("/check-version", (req, res) => {
  res.json({
    version      : req.app.locals.serverID,          // timestamp para detectar reinicios
    appVersion   : require("../package.json").version, // semántica: "2.0.8"
  });
});

// ── MANTENIMIENTO ────────────────────────────────────────────────
router.get("/check-mantenimiento", async (req, res, next) => {
  try {
    const [rows] = await db.raw(
      "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1",
    );
    if (rows.length > 0) res.json(rows[0]);
    else res.json({ activo: false, mensaje: "", fecha: "" });
  } catch (err) { next(err); }
});

router.post("/update-mantenimiento", async (req, res, next) => {
  try {
    const { activo, mensaje, fecha } = req.body;
    await db("mantenimiento").where({ id: 1 }).update({ activo, mensaje, fecha });

    if (global.io) global.io.emit("nuevo-aviso-global", { activo, mensaje, fecha });

    res.json({ status: "ok", mensaje: "Aviso guardado y notificado" });
  } catch (err) { next(err); }
});

// ── MÓDULOS PERMITIDOS ───────────────────────────────────────────
router.get("/mis-modulos", verificarAuth, async (req, res, next) => {
  const { rol, id } = req.user;

  if (rol === "superadmin") {
    return res.json({
      modulo_seleccion    : true,
      modulo_nomina       : true,
      modulo_postulaciones: true,
      modulo_requisiciones: true,
    });
  }

  const modulos = {
    modulo_seleccion    : false,
    modulo_nomina       : false,
    modulo_postulaciones: false,
    modulo_requisiciones: false,
    ...(DEFAULTS_MODULOS_POR_ROL[rol] || {}),
  };

  try {
    const [rows] = await db.raw(
      "SELECT seccion, CAST(puede_editar AS UNSIGNED) AS puede_editar FROM permisos_edicion WHERE usuario_id = ? AND seccion LIKE 'modulo_%'",
      [id],
    );
    rows.forEach((r) => {
      modulos[r.seccion] = r.puede_editar === 1;
    });
    res.json(modulos);
  } catch (err) { next(err); }
});

// ── HORA COLOMBIA ────────────────────────────────────────────────
router.get("/time-colombia", (req, res) => {
  const ahora = new Date();
  res.json({
    datetime  : ahora.toISOString(),
    formatted : ahora.toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: false }),
    fecha_hora: ahora.toISOString(),
    status    : "ok",
  });
});

module.exports = router;
