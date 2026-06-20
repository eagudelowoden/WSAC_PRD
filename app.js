require("dotenv").config();

const express      = require("express");
const path         = require("path");
const cookieParser = require("cookie-parser");
const http         = require("http");

// Inicialización de BD (crea tablas y superadmin si no existen)
require("./databases/bootstrap");

const { helmetMiddleware, corsMiddleware } = require("./config/security");
const transporter = require("./config/mailer");
const { initSockets } = require("./sockets");

// ── LOGGER CONDICIONAL ───────────────────────────────────────────
// En producción silencia los console.log informativos; los errores siempre se muestran
const IS_DEV = process.env.NODE_ENV !== "production";
global.log   = IS_DEV ? console.log.bind(console)  : () => {};
global.logWarn = IS_DEV ? console.warn.bind(console) : () => {};

// Middlewares de auth
const { verificarAuth, verificarSuperAdmin, verificarModulo } = require("./middlewares/auth");

const app    = express();
const server = http.createServer(app);

const serverID      = Date.now().toString();
app.locals.serverID = serverID;

const io  = initSockets(server, serverID);
global.io = io;

// ── SEGURIDAD ────────────────────────────────────────────────────
app.use(helmetMiddleware);

// ── CORS ─────────────────────────────────────────────────────────
app.use(corsMiddleware);

// ── COOKIES (necesario para leer req.cookies.wsac_token) ─────────
app.use(cookieParser());

// ── PARSERS ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ESTÁTICOS ────────────────────────────────────────────────────
app.use(express.static("public", { maxAge: "1d" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "1h" }));

// ── HEALTH CHECK (usado por el pipeline de despliegue) ───────────
app.get("/health", (req, res) => res.json({ status: "ok", serverID }));

// ── CACHÉ DE EMAILS DE NOTIFICACIÓN ─────────────────────────────
// Evita un SELECT en cada request — se refresca cada 5 minutos
let _emailsCache    = [];
let _emailsCacheAt  = 0;
const EMAIL_TTL     = 5 * 60 * 1000; // 5 min

async function getEmailsNotificacion() {
  if (Date.now() - _emailsCacheAt < EMAIL_TTL) return _emailsCache;
  try {
    const rows     = await require("./databases/knex")("notificaciones").select("email");
    _emailsCache   = rows.map((r) => r.email);
    _emailsCacheAt = Date.now();
  } catch { /* mantiene cache anterior */ }
  return _emailsCache;
}

// Inyectar transporter y emails (desde caché) en cada request
app.use(async (req, res, next) => {
  req.transporter          = transporter;
  req.emailsNotificaciones = await getEmailsNotificacion();
  next();
});

// ── RUTAS API (orden centralizado en routes/index.js) ────────────
app.use(require("./routes/index"));

// ── VISTAS ───────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const token = req.cookies?.wsac_token;
  if (token) res.redirect("/panel-administrativo");
  else       res.redirect("/login.html");
});

const vistaPrivada = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", file));

app.get("/visualizar.html",       vistaPrivada("visualizar.html"));
app.get("/registro.html",         vistaPrivada("registro.html"));
app.get("/subsanar.html",         vistaPrivada("subsanar.html"));
app.get("/firmar.html",           vistaPrivada("firmar.html"));
app.get("/panel-administrativo",  verificarAuth, verificarModulo("modulo_seleccion"),    vistaPrivada("index.html"));
app.get("/panel-aprobacionesDos", verificarAuth, verificarModulo("modulo_nomina"),       vistaPrivada("aprobacionesDos.html"));
app.get("/superadmin",            verificarSuperAdmin,                                   vistaPrivada("superadmin.html"));
app.get("/postulaciones",         verificarAuth, verificarModulo("modulo_postulaciones"),vistaPrivada("postulaciones.html"));
app.get("/agendamiento",          verificarAuth,                                         vistaPrivada("agendamientos.html"));

// ── PORTAL REQUISICIÓN ───────────────────────────────────────────
app.get("/portal",       (req, res) => res.redirect("/portal.html"));
app.get("/portal/inicio", verificarAuth, verificarModulo("modulo_portal"),        vistaPrivada("portal-requisicion.html"));
app.get("/requisiciones", verificarAuth, verificarModulo("modulo_requisiciones"), vistaPrivada("requisiciones.html"));

// ── MANEJO CENTRALIZADO DE ERRORES ───────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Errores de Multer (tamaño / tipo de archivo)
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ status: "error", message: "El archivo supera el límite de 20 MB." });
  if (err.message?.startsWith("Tipo de archivo no permitido"))
    return res.status(415).json({ status: "error", message: err.message });

  console.error("❌ Error no controlado:", err.message || err);
  const status  = err.status || err.statusCode || 500;
  const message = IS_DEV ? (err.message || "Error interno") : "Error interno del servidor";
  res.status(status).json({ status: "error", message });
});

module.exports = { app, server, serverID };
