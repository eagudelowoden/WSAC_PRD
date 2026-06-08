/**
 * routes/index.js — Registro centralizado de rutas
 *
 * REGLA: rutas específicas SIEMPRE antes que las genéricas /api
 * Agregar aquí cada nuevo router y el orden se mantiene solo.
 */
const router = require("express").Router();

// ── Específicas (orden importa) ──────────────────────────────────
router.use("/api/docs",              require("./routesDocs"));
router.use("/api/admin/users",       require("./usuarios.routes"));
router.use("/api/admin/permisos",    require("./permisos.routes"));
router.use("/api/admin",             require("./emails.routes"));
router.use("/api/requisiciones",     require("./requisiciones.routes"));
router.use("/api/descripcion-cargo", require("./descripcionCargo.routes"));
router.use("/api/portal",            require("./portal.routes"));

// ── Genéricas /api (al final para no capturar las específicas) ───
router.use("/api", require("./sistema.routes")); // login, logout, mis-modulos...
router.use("/api", require("./api"));            // usuarios, archivos, correos, subsanacion

module.exports = router;
