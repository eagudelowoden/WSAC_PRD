/**
 * PORTAL REQUISICIÓN — Rutas protegidas
 * Acceso: usuarios con permiso modulo_portal (rol "jefe")
 */
const express   = require("express");
const router    = express.Router();
const rateLimit = require("express-rate-limit");
const db        = require("../databases/knex");
const { verificarAuth, verificarModulo } = require("../middlewares/auth");

const portalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max     : 80,
  standardHeaders: true,
  legacyHeaders  : false,
});

// Crear tabla si no existe (solo primera vez)
db.raw(`
  CREATE TABLE IF NOT EXISTS requisiciones_portal (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    solicitante_id    INT NOT NULL,
    solicitante_nombre VARCHAR(150),
    area              VARCHAR(100),
    cargo_requerido   VARCHAR(150) NOT NULL,
    cantidad          INT DEFAULT 1,
    tipo_contrato     VARCHAR(80),
    salario_propuesto DECIMAL(12,2),
    justificacion     TEXT,
    perfil_requerido  TEXT,
    fecha_requerida   DATE,
    estado            ENUM('pendiente','en_proceso','aprobada','rechazada') DEFAULT 'pendiente',
    observaciones_rrhh TEXT,
    creado_en         DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_solicitante (solicitante_id),
    INDEX idx_estado (estado)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`).then(() => console.log("✅ Tabla requisiciones_portal verificada."))
  .catch((err) => console.error("❌ Error creando tabla portal:", err.message));

// Todas las rutas requieren sesión + permiso modulo_portal
router.use(verificarAuth);
router.use(verificarModulo("modulo_portal"));
router.use(portalLimiter);

// GET /api/portal/sesion — info del usuario actual
router.get("/sesion", (req, res) => {
  const { nombre, rol, id } = req.user;
  res.json({ nombre, rol, id });
});

// GET /api/portal/mis-requisiciones
router.get("/mis-requisiciones", async (req, res, next) => {
  try {
    const rows = await db("requisiciones_portal")
      .where({ solicitante_id: req.user.id })
      .select(
        "id", "cargo_requerido", "area", "cantidad", "tipo_contrato",
        "salario_propuesto", "fecha_requerida", "estado",
        "observaciones_rrhh", "creado_en",
      )
      .orderBy("creado_en", "desc")
      .limit(30);

    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/portal/requisicion — crear nueva requisición
router.post("/requisicion", async (req, res, next) => {
  const { id, nombre } = req.user;

  const cargo_requerido   = String(req.body?.cargo_requerido  || "").trim().substring(0, 150);
  const area              = String(req.body?.area             || "").trim().substring(0, 100);
  const cantidad          = parseInt(req.body?.cantidad)      || 1;
  const tipo_contrato     = String(req.body?.tipo_contrato    || "").trim().substring(0, 80);
  const salario_propuesto = parseFloat(req.body?.salario_propuesto) || null;
  const justificacion     = String(req.body?.justificacion    || "").trim().substring(0, 2000);
  const perfil_requerido  = String(req.body?.perfil_requerido || "").trim().substring(0, 2000);
  const fecha_requerida   = req.body?.fecha_requerida || null;

  if (!cargo_requerido || cargo_requerido.length < 3)
    return res.status(400).json({ error: "El cargo requerido es obligatorio." });
  if (!justificacion || justificacion.length < 10)
    return res.status(400).json({ error: "La justificación es obligatoria (mínimo 10 caracteres)." });

  try {
    const [result] = await db("requisiciones_portal").insert({
      solicitante_id    : id,
      solicitante_nombre: nombre,
      area, cargo_requerido, cantidad, tipo_contrato,
      salario_propuesto, justificacion, perfil_requerido, fecha_requerida,
    });

    // Notificar a RRHH (best-effort)
    if (req.transporter && req.emailsNotificaciones?.length) {
      req.transporter.sendMail({
        from   : process.env.OUTLOOK_USER,
        to     : req.emailsNotificaciones.join(","),
        subject: `📋 Nueva Requisición de Personal — ${area || "Sin área"} | ${cargo_requerido}`,
        html   : `
          <h3>Nueva Requisición de Personal</h3>
          <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 12px;font-weight:bold">Solicitante</td><td>${nombre}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Área</td><td>${area || "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Cargo</td><td>${cargo_requerido}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Cantidad</td><td>${cantidad}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Tipo contrato</td><td>${tipo_contrato || "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Salario propuesto</td><td>${salario_propuesto ? "$ " + salario_propuesto.toLocaleString("es-CO") : "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold">Fecha requerida</td><td>${fecha_requerida || "—"}</td></tr>
          </table>
          <h4 style="margin-top:16px">Justificación</h4>
          <p>${justificacion}</p>
          ${perfil_requerido ? `<h4>Perfil requerido</h4><p>${perfil_requerido}</p>` : ""}
        `,
      }).catch(() => {});
    }

    res.json({ ok: true, id: result });
  } catch (err) { next(err); }
});

module.exports = router;
