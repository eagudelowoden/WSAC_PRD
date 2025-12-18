// Archivo: services/pdfConversion.js
const axios = require('axios');
require('dotenv').config();

function convertirWordAPdf(wordBuffer) {
    return new Promise(async (resolve, reject) => {
        
        const secret = process.env.CONVERTAPI_SECRET;

        if (!secret) {
            return reject("❌ Falta la clave CONVERTAPI_SECRET en el .env");
        }

        console.log("🔄 Enviando a ConvertAPI (Modo Directo)...");

        try {
            // TRUCO: Agregamos 'download=attachment' en la URL.
            // Esto le dice a la API: "No me des un JSON, dame el archivo PDF binario ya".
            const url = `https://v2.convertapi.com/convert/docx/to/pdf?Secret=${secret}&download=attachment`;

            const response = await axios.post(url, wordBuffer, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Disposition': 'attachment; filename="archivo.docx"'
                },
                responseType: 'arraybuffer' // Importante: Esperamos un archivo binario
            });

            console.log("✅ PDF recibido correctamente.");
            
            // La respuesta YA ES el PDF. Lo convertimos a Buffer y lo devolvemos.
            resolve(Buffer.from(response.data));

        } catch (error) {
            // Si falla, intentamos leer el mensaje de error que viene oculto en el buffer
            let mensajeError = error.message;
            
            if (error.response && error.response.data) {
                // Convertimos el buffer de error a texto para leerlo
                const errorBody = Buffer.from(error.response.data).toString();
                console.error("❌ Respuesta de error de ConvertAPI:", errorBody);
                
                // Ojo: Si dice "Seconds limit exceeded", es que se acabó el plan gratis
                mensajeError = `Error API: ${errorBody}`;
            }
            
            reject(mensajeError);
        }
    });
}

module.exports = { convertirWordAPdf };