const express = require("express");
const router = express.Router();
const { verificarSuperAdmin } = require("../middlewares/auth");
const db = require("../databases/knex");

// GET /api/admin/seguridad/logs-login?limite=100&evento=rate_limit_ip&sospechoso=1
router.get("/logs-login", verificarSuperAdmin, async (req, res, next) => {
  try {
    const limite = Math.min(Number(req.query.limite) || 100, 500);

    let query = db("logs_seguridad").orderBy("creado_en", "desc").limit(limite);

    if (req.query.evento) query = query.where("evento", req.query.evento);
    if (req.query.usuario) query = query.where("usuario_intentado", "like", `%${req.query.usuario}%`);
    if (req.query.ip) query = query.where("ip", req.query.ip);
    if (req.query.sospechoso === "1") query = query.where("sospechoso_sqli", 1);

    const logs = await query;
    res.json({ status: "ok", total: logs.length, logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
