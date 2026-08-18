const express   = require("express");
const router    = express.Router();
const { verificarAuth } = require("../middlewares/auth");
const ctrl = require("../controllers/sistemaController");
const { loginLimiterByIp, loginLimiterByUser } = require("../middlewares/loginRateLimiters");

router.post("/login", loginLimiterByIp, loginLimiterByUser, ctrl.login);
router.post("/logout", ctrl.logout);
router.get("/check-version", ctrl.checkVersion);
router.get("/check-mantenimiento", ctrl.checkMantenimiento);
router.post("/update-mantenimiento", ctrl.updateMantenimiento);
router.get("/mis-modulos", verificarAuth, ctrl.misModulos);
router.get("/time-colombia", ctrl.timeColombia);

module.exports = router;
