// Archivo: services/wordService.js
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");
const db = require("../databases/knex");
const { subirArchivo } = require("./s3Service");
const { convertirWordAPdf } = require("./pdfConversion");

async function generarDocumento(
  idColaborador,
  nombrePlantilla,
  rutaBasePersonalizada,
) {
  return new Promise((resolve, reject) => {
    // 1. CORRECCIÓN: Usar la tabla correcta 'usuarios'
    const sql = "SELECT * FROM usuarios WHERE id = ?";

    db.raw(sql, [idColaborador]).then(async ([results]) => {
      if (results.length === 0) return reject("Usuario no encontrado");

      const p = results[0];
      console.log("✅ Datos usuario encontrados:", p.nombre);

      // --- FUNCIÓN AUXILIAR PARA FECHA LARGA EN MAYÚSCULAS ---
      const formatearFechaLarga = (fechaISO) => {
        if (!fechaISO) return "___ DE ________ DE 202_";

        const meses = [
          "ENERO",
          "FEBRERO",
          "MARZO",
          "ABRIL",
          "MAYO",
          "JUNIO",
          "JULIO",
          "AGOSTO",
          "SEPTIEMBRE",
          "OCTUBRE",
          "NOVIEMBRE",
          "DICIEMBRE",
        ];

        // Usamos una expresión regular para extraer solo año, mes, día y evitar desfases de zona horaria
        // Si fechaISO es un objeto Date, lo pasamos a string ISO primero
        const dateStr =
          typeof fechaISO === "string" ? fechaISO : fechaISO.toISOString();
        const [anio, mesNum, dia] = dateStr.split("T")[0].split("-");

        const mesNombre = meses[parseInt(mesNum) - 1];

        return `${parseInt(dia)} DE ${mesNombre} DEL ${anio}`;
      };

      // ============================================================
      // 2. MAPEO COMPLETO Y ROBUSTO (Paso 2)
      // ============================================================
      const datos = {
        // IDENTIFICACIÓN
        nombres: (p.nombres || p.nombre || "SIN NOMBRE").toUpperCase(),
        apellidos: (p.apellidos || "").toUpperCase(),
        documento: p.documento || p.usuario || "",
        email: (p.correo || "").toUpperCase(),
        telefono: (p.telefono || "").toUpperCase(),
        direccion: (p.direccion || "").toUpperCase(),
        ciudad: (p.ciudad || "BOGOTÁ").toUpperCase(),

        // SALUD Y PRESTACIONES (Nuevas agregadas)
        eps: (p.eps || "").toUpperCase(),
        arl: (p.arl || "").toUpperCase(),
        afp: (p.afp || "").toUpperCase(),
        ccf: (p.ccf || "").toUpperCase(),
        afiliaciones_familiares: (
          p.afiliaciones_familiares || "NO APLICA"
        ).toUpperCase(),

        // LABORAL
        cargo: (p.cargo || p.rol || "SIN CARGO").toUpperCase(),
        salario: p.salario ? Number(p.salario).toLocaleString("es-CO") : "0",
        segmento_contrato: (p.segmento_contrato || "").toUpperCase(),
        tipo_contrato: (p.tipo_contrato || "NO DEFINIDO").toUpperCase(),
        descripcion_cargo: (p.descripcion_cargo || "").toUpperCase(),
        observaciones: (p.observaciones || "").toUpperCase(),

        // FECHAS FORMATEADAS
        fecha_actual: formatearFechaLarga(new Date()),
        fecha_suscripcion: formatearFechaLarga(p.fecha_suscripcion),
        fecha_nacimiento: p.fechaNacimiento
          ? new Date(p.fechaNacimiento).toLocaleDateString("es-CO")
          : "",
        fechaterminacion: p.fechaterminacion
          ? formatearFechaLarga(p.fechaterminacion)
          : "INDEFINIDO",

        // APRENDIZAJE / SENA
        correo_aprendizaje: (p.correoAprendizaje || "").toUpperCase(),
        institucion: (p.institucion || "").toUpperCase(),
        nitinstitucion: p.nitinstitucion || "",
        centro_sena: (p.centroSena || "").toUpperCase(),

        // OTROS CONTROL
        id_usuario: p.id,
        carpeta: p.carpeta || "",
        otro_si: p.otro_si || "0",
      };

      // LOG PARA DEPURAR (Opcional, bórralo luego)
      console.log("Objeto enviado al Word:", datos);

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
          // Este nullGetter es vital: si el campo no existe, pondrá un aviso en el Word
          nullGetter(part) {
            if (!part.name) return "";
            return "[CAMPO NO ENCONTRADO: " + part.name + "]";
          },
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
          "application/pdf",
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
        try {
          await db.raw(sqlInsert, [p.id, nombreArchivoPDF, resultadoS3.url]);
        } catch (errInsert) {
          console.error(
            "⚠️ Advertencia: Se subió el archivo pero falló el registro en BD:",
            errInsert.message,
          );
        }

        // Si el usuario no tenía carpeta asignada en BD, se la actualizamos
        if (!p.carpeta) {
          db.raw("UPDATE usuariossys SET carpeta = ? WHERE id = ?", [
            carpetaUsuario,
            p.id,
          ]).catch(() => {});
        }

        // RETORNAMOS ÉXITO
        resolve({
          status: "ok",
          message: "PDF generado y guardado",
          url: resultadoS3.url,
          name: nombreArchivoPDF,
        });
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
    }).catch((err) => reject("Error BD: " + err.message));
  });
}

module.exports = { generarDocumento };
