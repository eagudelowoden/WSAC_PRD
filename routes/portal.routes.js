/**
 * PORTAL REQUISICIÓN — Rutas protegidas
 * ─────────────────────────────────────────────────────────────────
 * Acceso: usuarios del sistema con permiso modulo_portal (rol "jefe")
 * Auth:   misma sesión del sistema → req.session.usuario
 * ─────────────────────────────────────────────────────────────────
 */

const express   = require("express");
const router    = express.Router();
const rateLimit = require("express-rate-limit");
const db        = require("../databases/db");
const { verificarAuth, verificarModulo } = require("../middlewares/auth");

// Rate limiter general para el portal
const portalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max     : 80,
  standardHeaders: true,
  legacyHeaders  : false,
});

// ─── INICIALIZACIÓN DE TABLAS ─────────────────────────────────────
function inicializarTablas() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS requisiciones_portal (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      solicitante_id   INT NOT NULL,
      solicitante_nombre VARCHAR(150),
      area             VARCHAR(100),
      cargo_requerido  VARCHAR(150) NOT NULL,
      cantidad         INT DEFAULT 1,
      tipo_contrato    VARCHAR(80),
      salario_propuesto DECIMAL(12,2),
      justificacion    TEXT,
      perfil_requerido TEXT,
      fecha_requerida  DATE,
      estado           ENUM('pendiente','en_proceso','aprobada','rechazada') DEFAULT 'pendiente',
      observaciones_rrhh TEXT,
      creado_en        DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_solicitante (solicitante_id),
      INDEX idx_estado (estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
  sqls.forEach(sql => db.query(sql, err => {
    if (err) console.error("❌ Error creando tabla portal:", err.message);
    else console.log("✅ Tabla portal verificada.");
  }));
}
inicializarTablas();

// ── Todas las rutas requieren sesión activa + permiso modulo_portal ──
router.use(verificarAuth);
router.use(verificarModulo("modulo_portal"));
router.use(portalLimiter);

// ─────────────────────────────────────────────────────────────────
// GET /api/portal/sesion — info del usuario actual
// ─────────────────────────────────────────────────────────────────
router.get("/sesion", (req, res) => {
  const u = req.session.usuario;
  res.json({ nombre: u.nombre, rol: u.rol, id: u.id });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/portal/mis-requisiciones — lista del solicitante
// ─────────────────────────────────────────────────────────────────
router.get("/mis-requisiciones", (req, res) => {
  const { id } = req.session.usuario;
  db.query(
    `SELECT id, cargo_requerido, area, cantidad, tipo_contrato,
            salario_propuesto, fecha_requerida, estado,
            observaciones_rrhh, creado_en
     FROM requisiciones_portal
     WHERE solicitante_id = ?
     ORDER BY creado_en DESC
     LIMIT 30`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Error al obtener requisiciones." });
      res.json(rows || []);
    }
  );
});

// ─────────────────────────────────────────────────────────────────
// POST /api/portal/requisicion — crear nueva requisición
// ─────────────────────────────────────────────────────────────────
router.post("/requisicion", (req, res) => {
  const { id, nombre } = req.session.usuario;

  const cargo_requerido   = String(req.body?.cargo_requerido  || "").trim().substring(0, 150);
  const area              = String(req.body?.area             || "").trim().substring(0, 100);
  const cantidad          = parseInt(req.body?.cantidad)      || 1;
  const tipo_contrato     = String(req.body?.tipo_contrato    || "").trim().substring(0, 80);
  const salario_propuesto = parseFloat(req.body?.salario_propuesto) || null;
  const justificacion     = String(req.body?.justificacion    || "").trim().substring(0, 2000);
  const perfil_requerido  = String(req.body?.perfil_requerido || "").trim().substring(0, 2000);
  const fecha_requerida   = req.body?.fecha_requerida || null;

  if (!cargo_requerido || cargo_requerido.length < 3) {
    return res.status(400).json({ error: "El cargo requerido es obligatorio." });
  }
  if (!justificacion || justificacion.length < 10) {
    return res.status(400).json({ error: "La justificación es obligatoria (mínimo 10 caracteres)." });
  }

  db.query(
    `INSERT INTO requisiciones_portal
      (solicitante_id, solicitante_nombre, area, cargo_requerido, cantidad,
       tipo_contrato, salario_propuesto, justificacion, perfil_requerido, fecha_requerida)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nombre, area, cargo_requerido, cantidad, tipo_contrato,
     salario_propuesto, justificacion, perfil_requerido, fecha_requerida],
    (err, result) => {
      if (err) return res.status(500).json({ error: "No se pudo crear la requisición." });

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
              <tr><td style="padding:6px 12px;font-weight:bold">Área</td><td>${area || '—'}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold">Cargo</td><td>${cargo_requerido}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold">Cantidad</td><td>${cantidad}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold">Tipo contrato</td><td>${tipo_contrato || '—'}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold">Salario propuesto</td><td>${salario_propuesto ? '$ ' + salario_propuesto.toLocaleString('es-CO') : '—'}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:bold">Fecha requerida</td><td>${fecha_requerida || '—'}</td></tr>
            </table>
            <h4 style="margin-top:16px">Justificación</h4>
            <p>${justificacion}</p>
            ${perfil_requerido ? `<h4>Perfil requerido</h4><p>${perfil_requerido}</p>` : ''}
          `,
        }).catch(() => {});
      }

      res.json({ ok: true, id: result.insertId });
    }
  );
});

module.exports = router;
