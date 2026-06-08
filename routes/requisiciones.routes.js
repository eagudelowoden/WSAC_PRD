/**
 * REQUISICIONES — Gestión RRHH
 * Acceso: usuarios con permiso modulo_requisiciones (o superadmin)
 */
const express = require("express");
const router  = express.Router();
const db      = require("../databases/knex");
const { verificarAuth, verificarModulo } = require("../middlewares/auth");

router.use(verificarAuth);
router.use(verificarModulo("modulo_requisiciones"));

// GET /api/requisiciones — listar todas con filtros opcionales
router.get("/", async (req, res, next) => {
  try {
    const { estado, search } = req.query;

    const query = db("requisiciones_portal as r")
      .select(
        "r.id", "r.solicitante_nombre", "r.area", "r.cargo_requerido",
        "r.cantidad", "r.tipo_contrato", "r.salario_propuesto",
        "r.justificacion", "r.perfil_requerido",
        db.raw("DATE_FORMAT(r.fecha_requerida, '%Y-%m-%d') AS fecha_requerida"),
        "r.estado", "r.observaciones_rrhh",
        db.raw("DATE_FORMAT(r.creado_en, '%Y-%m-%d %H:%i') AS creado_en"),
      )
      .orderBy("r.creado_en", "desc")
      .limit(200);

    if (estado && estado !== "todas") query.where("r.estado", estado);
    if (search) {
      const like = `%${search}%`;
      query.where((q) => {
        q.whereLike("r.cargo_requerido", like)
          .orWhereLike("r.solicitante_nombre", like)
          .orWhereLike("r.area", like);
      });
    }

    const rows = await query;
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/requisiciones/:id — actualizar estado y observaciones
router.put("/:id", async (req, res, next) => {
  const { estado, observaciones_rrhh } = req.body;
  const estados = ["pendiente", "en_proceso", "aprobada", "rechazada"];

  if (!estados.includes(estado))
    return res.status(400).json({ error: "Estado inválido." });

  try {
    const updated = await db("requisiciones_portal")
      .where({ id: req.params.id })
      .update({ estado, observaciones_rrhh: observaciones_rrhh || null, actualizado_en: db.fn.now() });

    if (!updated) return res.status(404).json({ error: "No encontrada." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
