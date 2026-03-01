const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const RUTA_PLANTILLAS = process.env.RUTA_PLANTILLAS;


// 1. IMPORTAMOS LOS SERVICIOS
const wordService = require("../services/generador");
// 👇 IMPORTANTE: Traemos la función de borrar desde el servicio S3
const { eliminarArchivo } = require("../services/s3Service");



// ============================================================
// 1. OBTENER LISTA DE PLANTILLAS DISPONIBLES
// ============================================================
router.get("/templates", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  // VALIDACIÓN DE SEGURIDAD
  if (!RUTA_PLANTILLAS || !fs.existsSync(RUTA_PLANTILLAS)) {
    console.error("❌ LA RUTA NO EXISTE O NO ESTÁ DEFINIDA:", RUTA_PLANTILLAS);
    return res.status(404).json({ 
      error: "Carpeta de plantillas no encontrada", 
      rutaBuscada: RUTA_PLANTILLAS 
    });
  }

  try {
    fs.readdir(RUTA_PLANTILLAS, (err, files) => {
      if (err) {
        console.error("Error leyendo carpeta:", err);
        return res.status(500).json({ error: "No se pudo leer la carpeta" });
      }

      // Filtrar .docx y omitir archivos temporales de Word (~$)
      const plantillas = files.filter((file) => {
        return file.toLowerCase().endsWith(".docx") && !file.startsWith("~$");
      });

      res.json(plantillas);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================================
// 2. GENERAR DOCUMENTO (POST)
// ============================================================
router.post("/generate", async (req, res) => {
  try {
    const { idColaborador, nombrePlantilla } = req.body;

    if (!idColaborador || !nombrePlantilla) {
      return res.status(400).json({ status: "error", message: "Faltan datos" });
    }

    // Llamamos al servicio que Genera -> Convierte a PDF -> Sube a S3 -> Guarda en BD
    const resultado = await wordService.generarDocumento(
      idColaborador,
      nombrePlantilla,
      RUTA_PLANTILLAS,
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error generando:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
  //Corecciones generales
});

// ============================================================
// 3. ELIMINAR ARCHIVO (DELETE)
// ============================================================
router.delete("/eliminar-archivo", async (req, res) => {
  const { key } = req.body;

  if (!key)
    return res.status(400).json({ message: "Falta la ruta del archivo (Key)" });

  try {
    // Usamos la función importada de s3Service
    await eliminarArchivo(key);

    res.json({ status: "ok", message: "Archivo eliminado" });
  } catch (error) {
    console.error("Error ruta delete:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

module.exports = router;
