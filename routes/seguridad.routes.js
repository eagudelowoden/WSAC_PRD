const express = require("express");
const router = express.Router();
const { verificarSuperAdmin } = require("../middlewares/auth");
const db = require("../databases/knex");
const {
  loginLimiterByIp,
  loginLimiterByUser,
  claveIp,
  claveUsuario,
} = require("../middlewares/loginRateLimiters");

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

// POST /api/admin/seguridad/reset-limite  { tipo: "ip" | "usuario", valor: "..." }
// Libera el contador de rate limit sin reiniciar el servidor completo.
router.post("/reset-limite", verificarSuperAdmin, async (req, res) => {
  const { tipo, valor } = req.body || {};

  if (!valor || !["ip", "usuario"].includes(tipo)) {
    return res.status(400).json({
      status: "error",
      message: "Debes indicar tipo ('ip' o 'usuario') y valor.",
    });
  }

  try {
    if (tipo === "ip") {
      await loginLimiterByIp.resetKey(claveIp(valor));
    } else {
      await loginLimiterByUser.resetKey(claveUsuario(valor));
    }
    res.json({ status: "ok", message: `Contador de ${tipo} "${valor}" reseteado.` });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

module.exports = router;
