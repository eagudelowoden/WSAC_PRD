require("dotenv").config();

const express      = require("express");
const path         = require("path");
const helmet       = require("helmet");
const cookieParser = require("cookie-parser");
const cors         = require("cors");
const nodemailer   = require("nodemailer");
const http         = require("http");
const { Server }   = require("socket.io");

// Inicialización de BD (crea tablas y superadmin si no existen)
const db = require("./databases/db");

// ── LOGGER CONDICIONAL ───────────────────────────────────────────
// En producción silencia los console.log informativos; los errores siempre se muestran
const IS_DEV = process.env.NODE_ENV !== "production";
global.log   = IS_DEV ? console.log.bind(console)  : () => {};
global.logWarn = IS_DEV ? console.warn.bind(console) : () => {};

// Middlewares de auth
const { verificarAuth, verificarSuperAdmin, verificarModulo } = require("./middlewares/auth");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
global.io    = io;

const serverID      = Date.now().toString();
app.locals.serverID = serverID;

// ── SEGURIDAD ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── CORS ─────────────────────────────────────────────────────────
app.use(cors({
  origin     : [process.env.URL_BASE, "http://localhost:8081", "http://127.0.0.1:8081"].filter(Boolean),
  methods    : ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ── COOKIES (necesario para leer req.cookies.wsac_token) ─────────
app.use(cookieParser());

// ── PARSERS ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── ESTÁTICOS ────────────────────────────────────────────────────
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── CORREO ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host      : process.env.OUTLOOK_HOST,
  port      : parseInt(process.env.OUTLOOK_PORT),
  secure    : process.env.OUTLOOK_SECURE === "true",
  requireTLS: process.env.OUTLOOK_REQUIRE_TLS === "true",
  auth      : { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

transporter.verify((error) => {
  if (error) console.error("❌ Error conectando al correo:", error.message);
  else       log("✅ Servidor de correo listo.");
});

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

// ── SOCKETS ──────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.emit("version-actual", serverID);

  db.query(
    "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1",
    (err, result) => {
      if (!err && result.length > 0) socket.emit("mantenimiento", result[0]);
    },
  );

  socket.on("disconnect", () => {});
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
