const express = require("express");
const router  = express.Router();
const { registrarActividad, verificarAuth } = require("../middlewares/auth");
const ctrl = require("../controllers/usuariosController");

// ⚠️ Rutas específicas SIEMPRE antes que /:id

// Sesión actual (JWT) — verificarAuth setea req.user desde la cookie
router.get("/session/actual", verificarAuth, ctrl.sesionActual);

// Listar segmentos (carpetas)
router.get("/segmentos", ctrl.listarSegmentos);

// Cargos por segmento
router.get("/cargos-por-segmento/:segmento", ctrl.cargosPorSegmento);

// Listar todos los colaboradores
router.get("/", ctrl.listarColaboradores);

// ⚠️ /:id al final

router.get("/usuario/:id", ctrl.obtenerColaborador);
router.put("/usuario/:id", verificarAuth, registrarActividad("Actualizar usuario"), ctrl.actualizarColaborador);
router.patch("/usuario/:id/estado", verificarAuth, registrarActividad("Cambiar estado colaborador"), ctrl.cambiarEstadoColaborador);
// Desactivar / reactivar colaborador (nunca se borra el registro ni sus archivos).
router.patch("/usuario/:id/activo", verificarAuth, registrarActividad("Cambiar estado activo colaborador"), ctrl.desactivarColaborador);
// Compatibilidad: el antiguo DELETE ahora desactiva.
router.delete("/usuario/:id", registrarActividad("Desactivar colaborador"), ctrl.desactivarColaborador);

module.exports = router;
