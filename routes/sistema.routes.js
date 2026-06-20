const express   = require("express");
const router    = express.Router();
const rateLimit = require("express-rate-limit");
const { verificarAuth } = require("../middlewares/auth");
const ctrl = require("../controllers/sistemaController");

// Máximo 10 intentos de login por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs       : 15 * 60 * 1000,
  max            : 10,
  standardHeaders: true,
  legacyHeaders  : false,
  message        : { status: "error", message: "Demasiados intentos. Espera 15 minutos." },
  skipSuccessfulRequests: true, // no penaliza logins exitosos
});

router.post("/login", loginLimiter, ctrl.login);
router.post("/logout", ctrl.logout);
router.get("/check-version", ctrl.checkVersion);
router.get("/check-mantenimiento", ctrl.checkMantenimiento);
router.post("/update-mantenimiento", ctrl.updateMantenimiento);
router.get("/mis-modulos", verificarAuth, ctrl.misModulos);
router.get("/time-colombia", ctrl.timeColombia);

module.exports = router;
