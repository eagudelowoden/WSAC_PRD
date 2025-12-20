const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 1. IMPORTAMOS LOS SERVICIOS
const wordService = require('../services/generador'); 
// 👇 IMPORTANTE: Traemos la función de borrar desde el servicio S3
const { eliminarArchivo } = require('../services/s3Service'); 


// RUTA REAL DE TUS PLANTILLAS
const RUTA_PLANTILLAS = "C:\\Users\\Daniel\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PlantillasActualizadas";
//const RUTA_PLANTILLAS = "C:\\Users\\e.agudelo\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PlantillasActualizadas";

// ============================================================
// 1. OBTENER LISTA DE PLANTILLAS DISPONIBLES
// ============================================================
router.get('/templates', (req, res) => {
    try {
        fs.readdir(RUTA_PLANTILLAS, (err, files) => {
            if (err) {
                console.error("Error leyendo carpeta:", err);
                return res.status(500).json({ error: "No se pudo leer la carpeta de plantillas" });
            }

            // Filtramos solo los .docx
            const plantillas = files.filter(file => 
                file.endsWith('.docx') && !file.startsWith('~$')
            );

            res.json(plantillas);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// 2. GENERAR DOCUMENTO (POST)
// ============================================================
router.post('/generate', async (req, res) => {
    try {
        const { idColaborador, nombrePlantilla } = req.body;

        if (!idColaborador || !nombrePlantilla) {
            return res.status(400).json({ status: 'error', message: 'Faltan datos' });
        }

        // Llamamos al servicio que Genera -> Convierte a PDF -> Sube a S3 -> Guarda en BD
        const resultado = await wordService.generarDocumento(
            idColaborador, 
            nombrePlantilla, 
            RUTA_PLANTILLAS 
        );

        res.json(resultado);

    } catch (error) {
        console.error("Error generando:", error);
        res.status(500).json({ status: 'error', message: error.toString() });
    }
    //Corecciones generales
});

// ============================================================
// 3. ELIMINAR ARCHIVO (DELETE)
// ============================================================
router.delete("/eliminar-archivo", async (req, res) => {
    const { key } = req.body; 

    if (!key) return res.status(400).json({ message: "Falta la ruta del archivo (Key)" });

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