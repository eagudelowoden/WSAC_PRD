// Archivo: services/wordService.js
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");
const db = require("../databases/db");
const { subirArchivo } = require("./s3Service");
const { convertirWordAPdf } = require("./pdfConversion");

async function generarDocumento(
  idColaborador,
  nombrePlantilla,
  rutaBasePersonalizada
) {
  return new Promise((resolve, reject) => {
    // 1. CORRECCIÓN: Usar la tabla correcta 'usuarios'
    const sql = "SELECT * FROM usuarios WHERE id = ?";

    db.query(sql, [idColaborador], async (err, results) => {
      if (err) return reject("Error BD: " + err.message);
      if (results.length === 0) return reject("Usuario no encontrado");

      const p = results[0];
      console.log("✅ Datos usuario encontrados:", p.nombre);

      // 2. MAPEO ROBUSTO (Para que no salgan vacíos)
      const datos = {
        nombres: p.nombre || p.nombres || "Sin Nombre",
        apellidos: p.apellidos || "",
        documento: p.usuario || p.documento || "",
        fecha_actual: new Date().toLocaleDateString("es-CO"),
        cargo: p.rol || p.cargo || "Sin Cargo",
        salario: p.salario || "",
        ciudad: p.ciudad || "Bogotá",
        direccion: p.direccion || "",
        telefono: p.telefono || "",
        email: p.correo || "",
      };

      try {
        // 3. LEER PLANTILLA WORD
        const carpeta =
          rutaBasePersonalizada || path.resolve(__dirname, "../plantillas");
        const pathPlantilla = path.join(carpeta, nombrePlantilla);

        if (!fs.existsSync(pathPlantilla))
          return reject(`Plantilla no encontrada: ${nombrePlantilla}`);

        const content = fs.readFileSync(pathPlantilla, "binary");
        const zip = new PizZip(content);

        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "{{", end: "}}" },
          nullGetter: (part) => "",
        });

        doc.render(datos);
        const bufferWord = doc
          .getZip()
          .generate({ type: "nodebuffer", compression: "DEFLATE" });

        // ============================================================
        // 4. CONVERSIÓN A PDF
        // ============================================================
        console.log("🔄 Convirtiendo a PDF...");
        const bufferPDF = await convertirWordAPdf(bufferWord);
        console.log("✅ PDF Generado correctamente.");

        // ============================================================
        // 5. SUBIR PDF A AWS S3
        // ============================================================
        const nombreBase = nombrePlantilla.replace(".docx", "");
        const nombreArchivoPDF = `${nombreBase}.pdf`;

        // A. Definimos la carpeta raíz del usuario
        const carpetaRaiz = p.carpeta || `docs_${p.usuario || p.id}`;

        // B. DEFINIMOS LA SUBCARPETA (Aquí está el cambio)
        // Esto creará una estructura tipo: "docs_123456/contratos_generados/Contrato.pdf"
        const carpetaDestino = `${carpetaRaiz}/contratos_generados`;

        // Definir carpeta S3
        const carpetaUsuario = p.carpeta || `colaborador_${p.id}`;

        const resultadoS3 = await subirArchivo(
          bufferPDF,
          carpetaDestino, // <--- Usamos la variable con la subcarpeta
          nombreArchivoPDF,
          "application/pdf"
        );
        // ============================================================
        // 6. GUARDAR EN BASE DE DATOS (IMPORTANTE PARA QUE SE VEA EN LA LISTA)
        // ============================================================
        // Si tienes una tabla 'archivos', guardamos la referencia aquí.
        // Si no guardamos esto, al recargar la página el archivo "desaparece" de la vista.

        // NOTA: Ajusta el nombre de la tabla si no es 'archivos' (ej: documentos, anexos)
        const sqlInsert = `
                    INSERT INTO archivos (usuario_id, nombre_archivo, url, fecha_carga)
                    VALUES (?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE url = VALUES(url), fecha_carga = NOW()
                `;

        // Ejecutamos la inserción sin esperar (fire and forget) o esperamos si prefieres
        db.query(
          sqlInsert,
          [p.id, nombreArchivoPDF, resultadoS3.url],
          (errInsert) => {
            if (errInsert)
              console.error(
                "⚠️ Advertencia: Se subió el archivo pero falló el registro en BD:",
                errInsert.message
              );

            // Si el usuario no tenía carpeta asignada en BD, se la actualizamos
            if (!p.carpeta) {
              db.query("UPDATE usuariossys SET carpeta = ? WHERE id = ?", [
                carpetaUsuario,
                p.id,
              ]);
            }

            // RETORNAMOS ÉXITO
            resolve({
              status: "ok",
              message: "PDF generado y guardado",
              url: resultadoS3.url,
              name: nombreArchivoPDF,
            });
          }
        );
      } catch (error) {
        if (error.properties && error.properties.errors) {
          const msg = error.properties.errors
            .map((e) => e.properties.explanation)
            .join("\n");
          return reject("Error Plantilla Word: " + msg);
        }
        console.error("Error general:", error);
        reject(error);
      }
    });
  });
}

module.exports = { generarDocumento };
