require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const nodemailer = require("nodemailer");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./databases/db");

// Rutas
const apiRoutes = require("./routes/api");
const docRoutes = require("./routes/routesDocs");
const sistemaRoutes = require("./routes/sistema.routes");
const usuariosRoutes = require("./routes/usuarios.routes");
const permisosRoutes = require("./routes/permisos.routes");
const descripcionCargoRoutes = require("./routes/descripcionCargo.routes");
const emailsRoutes = require("./routes/emails.routes");

// Middlewares de auth
const { verificarAuth, verificarSuperAdmin, verificarModulo } = require("./middlewares/auth");
const portalRoutes = require("./routes/portal.routes");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
const server = http.createServer(app);
const io = new Server(server);
global.io = io;

const serverID = Date.now().toString();
app.locals.serverID = serverID;

// ── CORS ────────────────────────────────────────────────────────
app.use(
  cors({
    origin: ["http://localhost:8081", "http://127.0.0.1:8081"], // O el puerto donde corra tu FRONTEND
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // Esto permite que las cookies pasen
  }),
);

// ── SESIÓN ──────────────────────────────────────────────────────
const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore({}, db);

app.use(
  session({
    key: "session_cookie_name",
    secret: "secreto_mysql_seguro",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000,
      httpOnly: true,
      secure: false, // Cambiar a true solo si usas HTTPS
      sameSite: "lax", // Ayuda con la persistencia entre rutas
    },
  }),
);

// ── PARSERS ─────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ── ESTÁTICOS ───────────────────────────────────────────────────
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── CORREO ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

transporter.verify((error) => {
  if (error) console.log("❌ Error conectando al correo:", error);
  else console.log("✅ Servidor de correo listo.");
});

app.use((req, res, next) => {
  req.transporter = transporter;
  db.query("SELECT email FROM notificaciones", (err, results) => {
    req.emailsNotificaciones = results ? results.map((r) => r.email) : [];
    next();
  });
});

// ── SOCKETS ─────────────────────────────────────────────────────
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

// ── RUTAS API ───────────────────────────────────────────────────
app.use("/api/docs", docRoutes);
app.use("/api", sistemaRoutes);
app.use("/api/admin/users", usuariosRoutes);
app.use("/api/admin/permisos", permisosRoutes);
app.use("/api/admin", emailsRoutes);
app.use("/api", apiRoutes);
app.use("/api/descripcion-cargo", descripcionCargoRoutes);
app.use("/api/portal", portalRoutes);

// ── VISTAS ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  if (req.session.usuario) res.redirect("/panel-administrativo");
  else res.redirect("/login.html");
});

const vistaPrivada = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", file));

app.get("/visualizar.html", vistaPrivada("visualizar.html"));
app.get("/registro.html", vistaPrivada("registro.html"));
app.get("/subsanar.html", vistaPrivada("subsanar.html"));
app.get("/firmar.html", vistaPrivada("firmar.html"));
app.get("/panel-administrativo", verificarAuth, verificarModulo("modulo_seleccion"), vistaPrivada("index.html"));
app.get("/panel-aprobacionesDos", verificarAuth, verificarModulo("modulo_nomina"), vistaPrivada("aprobacionesDos.html"));
app.get("/superadmin", verificarSuperAdmin, vistaPrivada("superadmin.html"));
app.get("/postulaciones", verificarAuth, verificarModulo("modulo_postulaciones"), vistaPrivada("postulaciones.html"));
app.get("/agendamiento", verificarAuth, vistaPrivada("agendamientos.html"));

// ── PORTAL REQUISICIÓN (requiere login del sistema + permiso portal) ──
// /portal redirige al login del portal
app.get("/portal", (req, res) => res.redirect("/portal.html"));
app.get("/portal/inicio", verificarAuth, verificarModulo("modulo_portal"), vistaPrivada("portal-requisicion.html"));

// Exportamos tanto app como server (server lo necesita server.js para el listen)
module.exports = { app, server, serverID };
