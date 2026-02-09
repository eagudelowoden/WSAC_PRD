const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Convierte Word a PDF usando la ruta directa al ejecutable.
 */
async function convertirWordAPdf(wordBuffer) {
    console.log("🔄 Iniciando conversión local (Ruta Absoluta)...");

    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `temp_${Date.now()}.docx`);
    
    // DEFINIMOS LA RUTA AL EXE (Asegúrate de que sea esta)
    const sofficePath = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe"`;

    try {
        await fs.writeFile(inputPath, wordBuffer);

        // Usamos la ruta absoluta en el comando
        const comando = `${sofficePath} --headless --convert-to pdf --outdir "${tempDir}" "${inputPath}"`;
        
        return new Promise((resolve, reject) => {
            exec(comando, async (error, stdout, stderr) => {
                if (error) {
                    console.error("❌ Error en comando soffice:", stderr || error.message);
                    return reject(new Error("Error al ejecutar LibreOffice."));
                }

                const outputPath = inputPath.replace('.docx', '.pdf');

                try {
                    const pdfBuffer = await fs.readFile(outputPath);
                    
                    // Limpieza
                    await fs.unlink(inputPath);
                    await fs.unlink(outputPath);

                    console.log("✅ PDF generado con éxito.");
                    resolve(pdfBuffer);
                } catch (readError) {
                    console.error("❌ No se encontró el PDF:", readError);
                    reject(new Error("No se encontró el archivo PDF generado."));
                }
            });
        });

    } catch (err) {
        console.error("❌ Error en el proceso de conversión:", err);
        throw err;
    }
}

module.exports = { convertirWordAPdf };