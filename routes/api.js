const express = require("express");
const router = express.Router();

const usuariosRoutes = require("./usuarios.api.routes");
const archivosRoutes = require("./archivos.routes");
const correosRoutes = require("./correos.routes");
const subsanacionRoutes = require("./subsanacion.routes");

// ── Con prefijo (organización interna) ──────────────────────────
router.use("/usuarios", usuariosRoutes);
router.use("/usuario", usuariosRoutes);
router.use("/archivos", archivosRoutes);

// ── Sin prefijo (compatibilidad con frontend) ───────────────────
// Todos los endpoints originales siguen funcionando igual
router.use("/", usuariosRoutes); // /api/usuarios, /api/usuario/:id, /api/segmentos, /api/session/actual, /api/cargos-por-segmento/:segmento
router.use("/", archivosRoutes); // /api/archivos/:carpeta, /api/upload-documento-colaborador, /api/renombrar-archivo-s3, /api/eliminar-archivo, /api/listar-firmados/:carpeta, /api/ver-archivo
router.use("/", correosRoutes); // /api/enviar-historial-contratos, /api/notificar-aprobacion, /api/notificar-nomina, /api/notificarRegistro
router.use("/", subsanacionRoutes); // /api/solicitar-subsanar, /api/validar-token/:token, /api/subir-correccion, /api/solicitar-firma-contratos, /api/subir-firmados, /api/validar-token-firma/:token

module.exports = router;
