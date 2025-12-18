// Archivo: index.js o routes/docs.js
// 1. Asegúrate de que la ruta del require sea correcta según tu carpeta
const { vincularDescripcionCargo } = require("../services/cargoPdfService");
const router = express.Router();
// 2. Definimos la ruta con el prefijo /api para que tu frontend lo encuentre
app.post("/servicePdf/vincular-cargo-pdf", async (req, res) => {
    // Recibimos los datos del body enviados por Vue
    const { idColaborador, archivoPdf, segmento } = req.body;
    
    // Validación básica de entrada
    if (!idColaborador || !archivoPdf || !segmento) {
        return res.status(400).json({ 
            status: "error", 
            message: "Faltan datos: idColaborador, archivoPdf o segmento son obligatorios." 
        });
    }

    try {
        // Ejecutamos la lógica de copia en S3 y registro en BD
        const resultado = await vincularDescripcionCargo(idColaborador, archivoPdf, segmento);
        
        // Enviamos la respuesta de éxito al frontend
        res.json(resultado);
    } catch (error) {
        console.error("❌ Error en el endpoint vincular-cargo-pdf:", error);
        
        // Es importante enviar el mensaje del error, no el objeto error completo
        res.status(500).json({ 
            status: "error", 
            message: typeof error === 'string' ? error : error.message || "Error interno del servidor" 
        });
    }
});
module.exports = router;