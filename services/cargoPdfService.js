const db = require("../databases/db");
const fs = require("fs");
const path = require("path");
const { s3Client, PutObjectCommand } = require("./s3Service"); // Cambiamos Copy por Put
const rutaLocalBase = process.env.SEGMENTOS;

async function vincularDescripcionCargo(
  idColaborador,
  nombreArchivoPdf,
  segmento,
) {
  return new Promise((resolve, reject) => {
    // 1. Consulta de usuario para saber su carpeta de destino
    const sql = "SELECT * FROM usuarios WHERE id = ?";

    db.query(sql, [idColaborador], async (err, results) => {
      if (err) return reject("Error BD: " + err.message);
      if (results.length === 0) return reject("Usuario no encontrado");

      const p = results[0];
      const bucketName = process.env.AWS_BUCKET_NAME;

      // 2. Ruta de DESTINO en S3
      const carpetaRaiz = p.carpeta || `docs_${p.usuario || p.id}`;
      const destinationKey = `${carpetaRaiz}/contratos_generados/${nombreArchivoPdf}`;

      // 3. Ruta de ORIGEN en tu DISCO LOCAL
      // Usamos la ruta que me pasaste

      //const rutaLocalBase = `C:\\Users\\e.agudelo\\Documents\\WSAC_PROD\\PublicaSegmentos`;
	    // const rutaLocalBase = `C:\\Users\\Administrator\\Documents\\WSAC_PROD\\PublicaSegmentos`;
      //const rutaLocalBase = `C:\\Users\\e.agudelo\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PublicaSegmentos`;
      const rutaArchivoLocal = path.join(
        rutaLocalBase,
        segmento,
        nombreArchivoPdf,
      );

      try {
        console.log(`📖 Leyendo archivo local: ${rutaArchivoLocal}`);

        // Verificamos si el archivo existe antes de intentar subirlo
        if (!fs.existsSync(rutaArchivoLocal)) {
          return reject(
            `El archivo no existe en la ruta local: ${rutaArchivoLocal}`,
          );
        }

        const fileContent = fs.readFileSync(rutaArchivoLocal);

        // 4. Subir a S3 (PutObject)
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: destinationKey,
          Body: fileContent,
          ContentType: "application/pdf",
        });

        await s3Client.send(command);
        console.log("✅ Subido con éxito a S3");

        const urlFinal = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${destinationKey}`;

        // 5. Registro en BD
        const sqlInsert = `
          INSERT INTO archivos (usuario_id, nombre_archivo, url, fecha_carga)
          VALUES (?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE url = VALUES(url), fecha_carga = NOW()
        `;

        db.query(
          sqlInsert,
          [p.id, `Descripción - ${nombreArchivoPdf}`, urlFinal],
          (errInsert) => {
            if (errInsert) console.error("⚠️ Error BD:", errInsert.message);

            resolve({
              status: "ok",
              message: "Archivo subido y vinculado",
              url: urlFinal,
            });
          },
        );
      } catch (error) {
        console.error("❌ Error durante la subida:", error);
        reject("Error al procesar archivo: " + error.message);
      }
    });
  });
}

module.exports = { vincularDescripcionCargo };
