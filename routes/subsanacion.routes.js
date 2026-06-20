const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const { registrarActividad } = require("../middlewares/auth");
const ctrl = require("../controllers/subsanacionController");

const MB     = 1024 * 1024;
const upload = multer({
  storage   : multer.memoryStorage(),
  limits    : { fileSize: 20 * MB, files: 10 },
  fileFilter(req, file, cb) {
    const allowed = /pdf|docx?|jpe?g|png/i;
    allowed.test(file.mimetype) || allowed.test(file.originalname)
      ? cb(null, true)
      : cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
  },
});

router.post("/solicitar-subsanar", registrarActividad("Solicitar subsanación"), ctrl.solicitarSubsanar);
router.get("/validar-token/:token", ctrl.validarTokenSubsanar);
router.post("/subir-correccion", upload.any(), ctrl.subirCorreccion);
router.get("/validar-token-firma/:token", ctrl.validarTokenFirma);
router.post("/solicitar-firma-contratos", registrarActividad("Solicitar firma de contratos"), ctrl.solicitarFirmaContratos);
router.post("/subir-firmados", upload.any(), ctrl.subirFirmados);

module.exports = router;
