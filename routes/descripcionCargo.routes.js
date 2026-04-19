const express = require("express");
const router = express.Router();
const { vincularDescripcionCargo } = require("../services/cargoPdfService");
const { registrarActividad } = require("../middlewares/auth");

// Vincular descripción de cargo al colaborador
router.post(
  "/vincular",
  registrarActividad("Vincular descripción de cargo"),
  async (req, res) => {
    const { idColaborador, archivoPdf, segmento } = req.body;

    if (!idColaborador || !archivoPdf || !segmento) {
      return res.status(400).json({
        status: "error",
        message:
          "Faltan datos: idColaborador, archivoPdf o segmento son obligatorios.",
      });
    }

    try {
      const resultado = await vincularDescripcionCargo(
        idColaborador,
        archivoPdf,
        segmento,
      );
      res.json(resultado);
    } catch (error) {
      console.error("❌ Error en vincular-cargo-pdf:", error);
      res.status(500).json({
        status: "error",
        message:
          typeof error === "string" ? error : error.message || "Error interno",
      });
    }
  },
);

module.exports = router;
