const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const { registrarActividad, verificarAuth } = require("../middlewares/auth");
const ctrl = require("../controllers/archivosController");

const MB     = 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fileSize: 20 * MB, files: 30 }, // máx 20 MB por archivo, 30 archivos
  fileFilter(req, file, cb) {
    const allowed = /pdf|docx?|jpe?g|png|xlsx?/i;
    allowed.test(file.mimetype) || allowed.test(file.originalname)
      ? cb(null, true)
      : cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
  },
});

// Ruta pública — registro de colaboradores (no requiere sesión)
router.post("/enviar", upload.any(), ctrl.enviarRegistro);

// Todas las demás rutas de archivos requieren sesión autenticada
router.use(verificarAuth);

// ⚠️ /ver-archivo y /listar-firmados ANTES de /:carpeta
router.get("/ver-archivo", ctrl.verArchivo);
router.get("/listar-firmados/:carpeta", ctrl.listarFirmados);
router.get("/:carpeta", ctrl.listarPorCarpeta);

router.post("/upload-documento-colaborador", registrarActividad("Subir documento colaborador"), upload.single("file"), ctrl.subirDocumentoColaborador);
router.post("/renombrar-archivo-s3", registrarActividad("Renombrar archivo S3"), ctrl.renombrarArchivo);
router.delete("/eliminar-archivo", registrarActividad("Eliminar archivo"), ctrl.eliminarArchivo);

module.exports = router;
