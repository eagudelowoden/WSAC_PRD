const express   = require("express");
const router    = express.Router();
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { verificarAuth } = require("../middlewares/auth");
const ctrl = require("../controllers/sistemaController");
const { registrarEventoSeguridad } = require("../services/securityLogger");

// Máximo 30 intentos por IP cada 15 minutos.
// Más permisivo que el límite por usuario: solo frena scripts/abuso masivo,
// no debe bloquear a toda una oficina/VPN por un solo usuario fallando.
const loginLimiterByIp = rateLimit({
  windowMs       : 15 * 60 * 1000,
  max            : 30,
  standardHeaders: true,
  legacyHeaders  : false,
  skipSuccessfulRequests: true, // no penaliza logins exitosos
  handler: async (req, res) => {
    await registrarEventoSeguridad({
      evento: "rate_limit_ip",
      usuarioIntentado: req.body?.usuario || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      motivo: "limite_ip_excedido",
    });
    res.status(429).json({ status: "error", message: "Demasiados intentos desde esta red. Espera 15 minutos." });
  },
});

// Máximo 8 intentos por usuario cada 15 minutos, independiente de la IP.
// Protege una cuenta puntual de fuerza bruta aunque el atacante rote de IP.
const loginLimiterByUser = rateLimit({
  windowMs       : 15 * 60 * 1000,
  max            : 8,
  standardHeaders: true,
  legacyHeaders  : false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const usuario = (req.body?.usuario || "").trim().toLowerCase();
    return usuario ? `user:${usuario}` : ipKeyGenerator(req.ip);
  },
  handler: async (req, res) => {
    await registrarEventoSeguridad({
      evento: "rate_limit_usuario",
      usuarioIntentado: req.body?.usuario || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      motivo: "limite_usuario_excedido",
    });
    res.status(429).json({ status: "error", message: "Demasiados intentos para este usuario. Espera 15 minutos." });
  },
});

router.post("/login", loginLimiterByIp, loginLimiterByUser, ctrl.login);
router.post("/logout", ctrl.logout);
router.get("/check-version", ctrl.checkVersion);
router.get("/check-mantenimiento", ctrl.checkMantenimiento);
router.post("/update-mantenimiento", ctrl.updateMantenimiento);
router.get("/mis-modulos", verificarAuth, ctrl.misModulos);
router.get("/time-colombia", ctrl.timeColombia);

module.exports = router;
