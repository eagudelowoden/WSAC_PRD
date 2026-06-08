/**
 * REQUISICIONES — Rutas para gestión RRHH
 * Acceso: usuarios con permiso modulo_requisiciones (o superadmin)
 */
const express = require("express");
const router  = express.Router();
const db      = require("../databases/db");
const { verificarAuth, verificarModulo } = require("../middlewares/auth");

router.use(verificarAuth);
router.use(verificarModulo("modulo_requisiciones"));

// GET /api/requisiciones — listar todas con filtros opcionales
router.get("/", (req, res) => {
  const { estado, search } = req.query;
  let sql = `
    SELECT r.id, r.solicitante_nombre, r.area, r.cargo_requerido,
           r.cantidad, r.tipo_contrato, r.salario_propuesto,
           r.justificacion, r.perfil_requerido,
           DATE_FORMAT(r.fecha_requerida, '%Y-%m-%d') AS fecha_requerida,
           r.estado, r.observaciones_rrhh,
           DATE_FORMAT(r.creado_en, '%Y-%m-%d %H:%i') AS creado_en
    FROM requisiciones_portal r
    WHERE 1=1
  `;
  const params = [];

  if (estado && estado !== "todas") {
    sql += " AND r.estado = ?";
    params.push(estado);
  }
  if (search) {
    sql += " AND (r.cargo_requerido LIKE ? OR r.solicitante_nombre LIKE ? OR r.area LIKE ?)";
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  sql += " ORDER BY r.creado_en DESC LIMIT 200";

  db.query("SELECT DATABASE() AS bd, COUNT(*) AS total FROM requisiciones_portal", (e2, r2) => {
    console.log("🗄️  [requisiciones] DB activa:", r2?.[0]?.bd, "| total rows:", r2?.[0]?.total);
  });
  db.query(sql, params, (err, rows) => {
    console.log("🔍 [requisiciones] err:", err?.message || null);
    console.log("🔍 [requisiciones] rows count:", rows?.length, rows);
    if (err) return res.status(500).json({ error: "Error al obtener requisiciones." });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(rows || []);
  });
});

// PUT /api/requisiciones/:id — actualizar estado y observaciones
router.put("/:id", (req, res) => {
  const { estado, observaciones_rrhh } = req.body;
  const estados = ["pendiente", "en_proceso", "aprobada", "rechazada"];
  if (!estados.includes(estado)) return res.status(400).json({ error: "Estado inválido." });

  db.query(
    `UPDATE requisiciones_portal
     SET estado = ?, observaciones_rrhh = ?, actualizado_en = NOW()
     WHERE id = ?`,
    [estado, observaciones_rrhh || null, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Error al actualizar." });
      if (result.affectedRows === 0) return res.status(404).json({ error: "No encontrada." });
      res.json({ ok: true });
    }
  );
});

module.exports = router;
