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
router.put("/usuario/:id", registrarActividad("Actualizar usuario"), ctrl.actualizarColaborador);
router.patch("/usuario/:id/estado", verificarAuth, registrarActividad("Cambiar estado colaborador"), ctrl.cambiarEstadoColaborador);
router.delete("/usuario/:id", registrarActividad("Eliminar usuario"), ctrl.eliminarColaborador);

module.exports = router;
