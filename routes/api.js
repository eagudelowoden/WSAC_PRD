// UBICACIÓN: routes/api.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../databases/db");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const axios = require("axios"); // Necesitarás instalar axios para descargar los archivos de S3 temporalmente
// IMPORTAMOS LIBRERÍAS DE AWS
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const PORT = process.env.PORT;
const RUTA_SEGMENTOS = process.env.SEGMENTOS;
const URL_BASE = process.env.URL_BASE;
const URL_BASEDEV = process.env.URL_BASEDEV || `http://localhost:${PORT}`;
const fsPromises = require("fs").promises;
const { vincularDescripcionCargo } = require("../services/cargoPdfService");
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
];
const AWS = require("aws-sdk");
const {
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

// Configurar las credenciales (si no las tienes globales)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadSeguro = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
  fileFilter: (req, file, cb) => {
    const ALLOWED_TYPES = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
    ];
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo incorrecto: ${file.originalname}`));
    }
  },
});
// FUNCIÓN AUXILIAR: Detectar el ADN real del archivo (Magic Numbers)
const validarFirmaReal = (buffer) => {
  if (!buffer || buffer.length < 4) return false;

  // Convertimos los primeros 4 bytes a Hexadecimal
  const hex = buffer.toString("hex", 0, 4).toUpperCase();

  // Firmas conocidas:
  // FFD8FF = JPG/JPEG
  // 89504E47 = PNG
  // 25504446 = PDF (%PDF)

  if (hex.startsWith("FFD8FF")) return true; // Es JPG
  if (hex.startsWith("89504E47")) return true; // Es PNG
  if (hex.startsWith("25504446")) return true; // Es PDF

  return false; // Es un impostor (EXE, JS, PHP, SH, etc.)
};
const uploadMiddleware = uploadSeguro.fields([
  { name: "cedula", maxCount: 1 },
  { name: "estudios", maxCount: 5 },
  { name: "laborales", maxCount: 5 },
  { name: "cesantias", maxCount: 1 },
  { name: "cuenta", maxCount: 1 },
  { name: "epsDocs", maxCount: 5 },
  { name: "referencias", maxCount: 5 },
  { name: "agenteCampo", maxCount: 5 },
  { name: "hv", maxCount: 1 },
  { name: "habeas", maxCount: 1 },
  { name: "consentimiento", maxCount: 1 },
]);

// ==========================================
// 1. CONFIGURACIÓN GENERAL
// ==========================================

// A. CONFIGURACIÓN CLIENTE S3 (AWS)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const BUCKET_NAME =
  process.env.AWS_BUCKET_NAME || "documentosnominaycontratacion";

// B. RUTA DE CARPETAS DE SEGMENTOS (ESTÁTICAS LOCALES)
// Esta ruta SE MANTIENE LOCAL porque son archivos fijos de la empresa en tu servidor
//const RUTA_SEGMENTOS = "C:\\Users\\Daniel\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PublicaSegmentos";

// C. CONFIGURACIÓN MULTER (EN MEMORIA)
// ¡IMPORTANTE! Usamos memoryStorage para poder mandar el archivo a la nube.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// D. CONFIGURACIÓN CORREO
const correoOutlook = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

// ==========================================
// 2. RUTAS DE INFORMACIÓN (GET)
// ==========================================

// Listar Usuarios
router.get("/usuarios", (req, res) => {
  // Llamada al SP
  const query = "CALL sp_ListarUsuariosResumen()";

  db.query(query, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    // RECUERDA: Los SP devuelven [filas, paquetes_extra]
    // Tus datos están en la posición 0
    const listaUsuarios = result[0];

    res.json(listaUsuarios);
  });
});

router.get("/usuario/:id", (req, res) => {
  // Llamamos al SP en lugar de escribir el SELECT
  const query = "CALL sp_ObtenerUsuarioPorId(?)";

  db.query(query, [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    // OJO AQUÍ:
    // Los SP devuelven un array de resultados. El primer elemento (result[0])
    // es la lista de filas que encontró.

    const filasEncontradas = result[0];

    // Validación: Si el array de filas está vacío
    if (!filasEncontradas || filasEncontradas.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Devolvemos la primera fila del primer resultado
    res.json(filasEncontradas[0]);
  });
});
// Listar Segmentos (Local)
router.get("/segmentos", (req, res) => {
  try {
    if (!fs.existsSync(RUTA_SEGMENTOS)) {
      return res.json([]);
    }
    const segmentos = fs
      .readdirSync(RUTA_SEGMENTOS, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
    res.json(segmentos);
  } catch (error) {
    console.error("Error leyendo segmentos:", error);
    res.status(500).json({ error: "Error leyendo carpeta de segmentos" });
  }
});
router.get("/session/actual", (req, res) => {
  // Verificamos si hay sesión guardada (según tu login anterior)
  if (req.session && req.session.usuario) {
    res.json({ status: "ok", usuario: req.session.usuario });
  } else {
    res.status(401).json({ status: "error", message: "No logueado" });
  }
});

// Listar Cargos por Segmento (Local)
router.get("/cargos-por-segmento/:segmento", async (req, res) => {
  try {
    const segmento = req.params.segmento;
    const rutaCompleta = path.join(RUTA_SEGMENTOS, segmento);

    // existsSync es muy rápido, se puede dejar, pero lo ideal es manejar el error en readdir
    if (!fs.existsSync(rutaCompleta)) return res.json([]);

    // CAMBIO AQUÍ: Usamos await y readdir (sin Sync)
    const archivosBrutos = await fsPromises.readdir(rutaCompleta);

    // Filtramos en memoria (esto es rapidísimo)
    const archivosFiltrados = archivosBrutos.filter(
      (file) =>
        file.toLowerCase().endsWith(".pdf") ||
        file.toLowerCase().endsWith(".docx"),
    );

    res.json(archivosFiltrados);
  } catch (error) {
    console.error("Error leyendo carpeta:", error);
    // Si la carpeta no existe, readdir lanza error, devolvemos array vacío
    if (error.code === "ENOENT") return res.json([]);

    res.status(500).json({ error: "Error leyendo cargos" });
  }
});

// ==========================================
// 3. RUTAS DE ARCHIVOS EN LA NUBE (S3)
// ==========================================

// Listar y Generar URLs firmadas para ver archivos
router.get("/archivos/:carpeta", async (req, res) => {
  const carpetaUsuario = req.params.carpeta;

  try {
    // 1. Listamos los archivos
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: carpetaUsuario + "/",
    });

    const response = await s3Client.send(command);

    // 2. Generamos URLs firmadas
    const filesPromises = (response.Contents || []).map(async (item) => {
      const fileName = item.Key.split("/").pop();

      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.Key,
      });

      const signedUrl = await getSignedUrl(s3Client, getCommand, {
        expiresIn: 3600,
      });

      return {
        name: fileName,
        url: signedUrl,
      };
    });

    const files = await Promise.all(filesPromises);
    res.json(files);
  } catch (err) {
    console.error("Error listando archivos S3:", err);
    res.json([]);
  }
});
router.post("/enviar-historial-contratos", async (req, res) => {
  const { usuario, archivos } = req.body;

  if (!archivos || archivos.length === 0) {
    return res
      .status(400)
      .json({ status: "error", message: "No hay archivos seleccionados." });
  }

  try {
    // 2. Descargamos de S3 usando la Signed URL que ya viene en el objeto 'archivos'
    const attachments = await Promise.all(
      archivos.map(async (file) => {
        const response = await axios.get(file.url, {
          responseType: "arraybuffer",
        });
        return {
          filename: file.name,
          content: Buffer.from(response.data),
        };
      }),
    );

    // 3. Diseño de correo corporativo WAS
    const mailOptions = {
      from: '"WAS Contratación" <eagudelo@woden.com.co>',
      to: usuario.correo,
      subject: `📝 Documentos Disponibles: ${usuario.nombres}`,
      html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e4e8; border-radius: 15px; overflow: hidden;">
                    <div style="background-color: #1e3a8a; padding: 20px; text-align: center; color: white;">
                        <h2 style="margin: 0;">WAS Info</h2>
                        <p style="margin: 0; opacity: 0.8; font-size: 0.9rem;">Gestión Documental de Contratación</p>
                    </div>
                    <div style="padding: 30px; color: #333; line-height: 1.6;">
                        <h3>Hola, ${usuario.nombres}</h3>
                        <p>Te informamos que se han generado los documentos correspondientes a tu proceso de contratación.</p>
                        <p>Encontrarás adjuntos a este mensaje <b>${archivos.length} archivo(s)</b> debidamente validados.</p>
                        <br>
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; font-size: 0.85rem; color: #64748b; border-left: 4px solid #1e3a8a;">
                            <b>Nota de seguridad:</b> Estos archivos contienen información sensible. Por favor, asegúrate de guardarlos en un lugar seguro.
                        </div>
                    </div>
                    <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 0.75rem; color: #94a3b8;">
                        &copy; 2025 WAS - Todos los derechos reservados.
                    </div>
                </div>
            `,
      attachments: attachments,
    };

    await correoOutlook.sendMail(mailOptions);
    res.json({ status: "ok", message: "Enviado con éxito" });
  } catch (error) {
    console.error("Error enviando historial S3:", error);
    res.status(500).json({
      status: "error",
      message: "Error al procesar los documentos de S3",
    });
  }
});

// ==========================================
// 4. RUTA PRINCIPAL DE REGISTRO (/enviar)
// ==========================================
router.post(
  "/enviar",
  (req, res, next) => {
    // Middleware wrapper para capturar errores de Multer limpiamente
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          status: "error",
          message: `Error subiendo archivos: ${err.message}`,
        });
      } else if (err) {
        return res.status(400).json({ status: "error", message: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const data = req.body;

      // 1. Aplanar archivos (upload.fields -> Array simple)
      let filesArray = [];
      if (req.files) {
        Object.values(req.files).forEach((files) => {
          filesArray = filesArray.concat(files);
        });
      }

      // VALIDACIÓN: Al menos un archivo
      if (filesArray.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Debes adjuntar al menos un documento.",
        });
      }

      const safeData = {
        ...data,
        afiliacionesFamiliares: data.afiliacionesFamiliares || "",
        observaciones: data.observaciones || "",
        otroSi: data.otroSi || "",
      };

      // Sanitizar nombre de carpeta
      const folderName = `${safeData.nombres}_${safeData.apellidos}`
        .trim()
        .replace(/\s+/g, "_");
      const fullName = folderName;

      // 2. SUBIR A S3
      const uploadPromises = filesArray.map((file) => {
        const cleanOriginalName = file.originalname.replace(/\s+/g, "_");
        const lastDotIndex = cleanOriginalName.lastIndexOf(".");
        const nombreBase = cleanOriginalName.substring(0, lastDotIndex);
        const extension = cleanOriginalName.substring(lastDotIndex);

        const fileName = `${nombreBase}_${Date.now()}${extension}`;
        const key = `${folderName}/${fileName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });

        return s3Client.send(command);
      });

      await Promise.all(uploadPromises);

      // 3. GUARDAR EN BASE DE DATOS
      const sql = `
            INSERT INTO usuarios (
                nombres, apellidos, documento, telefono, direccion, correo, fechaNacimiento,
                afiliaciones_familiares, eps, arl, afp, ccf, carpeta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

      const valores = [
        safeData.nombres,
        safeData.apellidos,
        safeData.documento,
        safeData.telefono,
        safeData.direccion,
        safeData.correo,
        safeData.fechaNacimiento,
        safeData.afiliacionesFamiliares,
        safeData.epsNombre,
        safeData.arlNombre,
        safeData.afpNombre,
        safeData.ccfNombre,
        fullName,
      ];

      // USAMOS 'result' para capturar el ID generado
      db.query(sql, valores, async (err, result) => {
        if (err) {
          console.error("Error SQL:", err);
          return res.status(500).json({
            status: "error",
            message: "Error guardando en BD: " + err.message,
          });
        }

        // ✅ CAPTURAMOS EL ID PARA EL FRONTEND
        const nuevoId = result.insertId;

        // 4. CORREO DE CONFIRMACIÓN AL COLABORADOR
        try {
          await correoOutlook.sendMail({
            from: '"WAS Sistema" <eagudelo@woden.com.co>',
            to: safeData.correo,
            subject: "Registro exitoso - Woden Colombia",
            html: `
              <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Hola ${safeData.nombres},</h2>
                <p>Tus documentos han sido recibidos por el área de selección y almacenados correctamente.</p>
                <p>Pronto nos pondremos en contacto contigo.</p>
                <br>
                <p><i>Este es un mensaje automático, por favor no responder.</i></p>
              </div>
            `,
          });
        } catch (e) {
          console.error("Error enviando correo de confirmación:", e);
        }

        // ✅ RESPUESTA FINAL CON EL ID INCLUIDO
        res.status(200).json({
          status: "ok",
          message: "Registro exitoso.",
          id: nuevoId,
        });
      });
    } catch (generalError) {
      console.error("Error en ruta /enviar:", generalError);
      res
        .status(500)
        .json({ status: "error", message: "Error procesando solicitud" });
    }
  },
);
router.delete("/docs/eliminar-archivo", async (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res
      .status(400)
      .json({ status: "error", message: "Falta la ruta (key) del archivo" });
  }

  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    // Comando real para borrar en S3
    await s3Client.send(new DeleteObjectCommand(params));

    console.log(`🗑️ Archivo eliminado de S3: ${key}`);

    res.json({ status: "ok", message: "Archivo eliminado físicamente de S3" });
  } catch (error) {
    console.error("Error eliminando de S3:", error);
    res.status(500).json({
      status: "error",
      message: "No se pudo eliminar el archivo de la nube",
    });
  }
});

router.put("/usuario/:id", async (req, res) => {
  // OJO: Ahora es async
  const id = req.params.id;
  const data = req.body;

  try {
    // ============================================================
    // 1. LÓGICA DE SUBIDA DE "DESCRIPCIÓN DE CARGO" A S3
    // ============================================================
    // Si nos envían un segmento y un PDF de cargo, lo subimos a la carpeta del usuario en S3
    if (data.segmento_contrato && data.descripcion_cargo) {
      // A. Primero necesitamos saber la carpeta del usuario en S3
      // Hacemos una consulta rápida para obtenerla
      const [userRows] = await db
        .promise()
        .query(
          "SELECT carpeta, nombres, apellidos FROM usuarios WHERE id = ?",
          [id],
        );

      if (userRows.length > 0) {
        let userFolder = userRows[0].carpeta;
        // Si por alguna razón no tiene carpeta, usamos Nombres + Apellidos
        if (!userFolder) {
          userFolder = `${userRows[0].nombres} ${userRows[0].apellidos}`.trim();
        }

        // B. Buscamos el archivo en tu disco local
        const rutaLocalPDF = path.join(
          RUTA_SEGMENTOS,
          data.segmento_contrato,
          data.descripcion_cargo,
        );

        if (fs.existsSync(rutaLocalPDF)) {
          // C. Leemos el archivo
          const fileContent = fs.readFileSync(rutaLocalPDF);

          // D. Preparamos la subida a S3
          // Lo guardamos con un prefijo para identificarlo fácil, ej: "CARGO_Analista.pdf"
          const s3Key = `${userFolder}/CARGO_${data.descripcion_cargo}`;

          const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
            ContentType: "application/pdf",
          });

          // E. Subimos a S3
          await s3Client.send(command);
          console.log(`✅ Descripción de cargo subida a S3: ${s3Key}`);
        } else {
          console.warn(`⚠️ El archivo local no existe: ${rutaLocalPDF}`);
        }
      }
    }
    // ============================================================

    // 2. ACTUALIZACIÓN EN BASE DE DATOS (Igual que antes)
    const sql = `
            UPDATE usuarios SET 
                nombres = ?, apellidos = ?, documento = ?, telefono = ?, direccion = ?, 
                correo = ?, fechaNacimiento = ?, eps = ?, arl = ?, afp = ?, ccf = ?, 
                ciudad = ?, salario = ?, cargo = ?, afiliaciones_familiares = ?,
                observaciones = ?, 
                segmento_contrato = ?, 
                descripcion_cargo = ?, 
                aprobacion = ?,
                otro_si = ?,
                tipo_contrato = ?,
                curso = ?,
                correoAprendizaje   = ?,
                institucion = ?,
                nitinstitucion = ?,
                centroSena = ?,
                fechaterminacion = ?,
                fecha_suscripcion = ?
            WHERE id = ?
        `;

    const valores = [
      data.nombres,
      data.apellidos,
      data.documento,
      data.telefono,
      data.direccion,
      data.correo,
      data.fechaNacimiento,
      data.epsNombre || data.eps,
      data.arlNombre || data.arl,
      data.afpNombre || data.afp,
      data.ccfNombre || data.ccf,
      data.ciudad,
      data.salario,
      data.cargo,
      data.afiliaciones_familiares,
      data.observaciones,
      data.segmento_contrato,
      data.descripcion_cargo,
      data.aprobacion,
      data.otroSi,
      data.tipo_contrato,
      data.curso,
      data.correoAprendizaje,
      data.institucion,
      data.nitinstitucion,
      data.centroSena,
      data.fechaterminacion || null,
      data.fechaSuscripcion || null,
      id,
    ];

    // Usamos await con la versión promesa de mysql2 o callback tradicional envuelto
    // Nota: Si tu 'db' no soporta .promise(), usa callback tradicional así:
    db.query(sql, valores, (err, result) => {
      if (err) {
        console.error("Error SQL:", err);
        return res.status(500).json({ status: "error", message: err.message });
      }
      res.json({
        status: "ok",
        message: "Datos actualizados y cargo subido a la nube",
      });
    });
  } catch (error) {
    console.error("Error en PUT /usuario:", error);
    res.status(500).json({
      status: "error",
      message: "Error interno procesando la solicitud",
    });
  }
});
// Eliminar usuario y sus archivos de S3
router.delete("/usuario/:id", (req, res) => {
  const id = req.params.id;

  // 1. Buscamos nombre de carpeta
  db.query(
    "SELECT carpeta FROM usuarios WHERE id = ?",
    [id],
    async (err, results) => {
      if (err || results.length === 0)
        return res
          .status(404)
          .json({ status: "error", message: "Usuario no encontrado" });

      const folderName = results[0].carpeta;

      // 2. Borrar de S3
      if (folderName) {
        try {
          const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: folderName + "/",
          });
          const listResponse = await s3Client.send(listCommand);

          if (listResponse.Contents && listResponse.Contents.length > 0) {
            const objectsToDelete = listResponse.Contents.map((item) => ({
              Key: item.Key,
            }));
            await s3Client.send(
              new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: { Objects: objectsToDelete },
              }),
            );
          }
        } catch (s3Error) {
          console.error("Error borrando S3:", s3Error);
        }
      }

      // 3. Borrar de BD
      db.query("DELETE FROM usuarios WHERE id = ?", [id], (errDelete) => {
        if (errDelete) return res.status(500).json({ status: "error" });
        res.json({ status: "ok", message: "Usuario y archivos eliminados" });
      });
    },
  );
});

// ==========================================
// 6. RUTAS DE SUBSANACIÓN (CON SUBIDA A S3)
// ==========================================

// A. ADMIN SOLICITA SUBSANACIÓN
router.post("/solicitar-subsanar", (req, res) => {
  const { id, motivo } = req.body;
  const token = crypto.randomBytes(20).toString("hex");

  db.query(
    "UPDATE usuarios SET token_subsanar = ?, fecha_solicitud_subsanar = NOW() WHERE id = ?",
    [token, id],
    (err) => {
      if (err)
        return res.status(500).json({ status: "error", message: err.message });

      db.query(
        "SELECT nombres, correo FROM usuarios WHERE id = ?",
        [id],
        async (err, users) => {
          if (!users || users.length === 0)
            return res
              .status(404)
              .json({ status: "error", message: "Usuario no encontrado" });

          const usuario = users[0];
          const link = `${URL_BASE}/subsanar.html?token=${token}`;

          try {
            const htmlEmail = `
              <div style="background-color: #f4f6f8; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; color: #333;">
                  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                      <tr>
                          <td style="background-color: #e2712a; padding: 30px; text-align: center;">
                              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">WAS CLOUD</h1>
                          </td>
                      </tr>
                      <tr>
                          <td style="padding: 40px 30px;">
                              <h2 style="color: #2c3e50; margin-top: 0;">¡Hola, ${usuario.nombres}!</h2>
                              <p style="font-size: 16px; line-height: 1.6; color: #555;">
                                  Se ha revisado tu solicitud en el sistema <strong>WAS</strong> y se requiere una corrección en los documentos adjuntos.
                              </p>
                              
                              <div style="background-color: #fff4ed; border-left: 4px solid #e2712a; padding: 15px; margin: 25px 0;">
                                  <strong style="color: #e2712a;">Motivo de la corrección:</strong><br>
                                  <span style="color: #444;">${motivo}</span>
                              </div>

                              <p style="font-size: 16px; line-height: 1.6; color: #555;">
                                  Por favor, haz clic en el siguiente botón para cargar los soportes corregidos y continuar con tu proceso:
                              </p>

                              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 30px;">
                                  <tr>
                                      <td align="center">
                                          <a href="${link}" style="background-color: #2c3e50; color: #ffffff; padding: 15px 35px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; transition: background 0.3s;">
                                              SUBIR DOCUMENTOS
                                          </a>
                                      </td>
                                  </tr>
                              </table>
                          </td>
                      </tr>
                      <tr>
                          <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                              <p style="font-size: 12px; color: #999; margin: 0;">
                                  Este es un correo automático, por favor no respondas a este mensaje.<br>
                                  <strong>Woden Colombia - Gestión de Aprobaciones v2.0</strong>
                              </p>
                          </td>
                      </tr>
                  </table>
              </div>
              `;

            await correoOutlook.sendMail({
              from: '"WAS Notificaciones" <eagudelo@woden.com.co>',
              to: usuario.correo,
              subject: "Acción Requerida: Corregir Documentos - WAS",
              html: htmlEmail,
            });

            res.json({ status: "ok", message: "Solicitud enviada al usuario" });
          } catch (e) {
            console.error(e);
            res
              .status(500)
              .json({ status: "error", message: "Error enviando correo" });
          }
        },
      );
    },
  );
});

router.post("/notificar-aprobacion", async (req, res) => {
  const { id, correo, nombres } = req.body;

  // 1. Buscamos los datos del usuario para asegurar que existe
  db.query(
    "SELECT nombres, correo, cargo, salario FROM usuarios WHERE id = ?",
    [id],
    async (err, users) => {
      if (err)
        return res.status(500).json({ status: "error", message: err.message });

      if (!users || users.length === 0) {
        return res
          .status(404)
          .json({ status: "error", message: "Usuario no encontrado" });
      }

      const usuario = users[0];

      try {
        // 2. Diseño del HTML para el correo de éxito
        const htmlEmail = `
        <div style="background-color: #f4f6f8; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; color: #333;">
            <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                <tr>
                    <td style="background-color: #F5B027; padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">WAS INFO</h1>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 40px 30px;">
                        <h2 style="color: #2c3e50; margin-top: 0;">¡Felicidades, ${usuario.nombres}!</h2>
                        <p style="font-size: 16px; line-height: 1.6; color: #555;">
                            Nos complace informarte que tus documentos han sido <strong>aprobados</strong> en el sistema WAS.
                        </p>
                        
                        <div style="background-color: #f0fff4; border-left: 4px solid #28a745; padding: 15px; margin: 25px 0;">
                            <strong style="color: #28a745;">Estado del proceso:</strong><br>
                            <span style="color: #444;">Contrato y documentos validados correctamente.</span>
                        </div>

                        <p style="font-size: 16px; line-height: 1.6; color: #555;">
                            Tu perfil ha sido actualizado con el cargo de <b>${usuario.cargo || "Asignado"}</b>. Pronto recibirás más instrucciones sobre los siguientes pasos.
                        </p>

                    </td>
                </tr>
                <tr>
                    <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="font-size: 12px; color: #999; margin: 0;">
                            Este es un correo automático de confirmación.<br>
                            <strong>Woden Colombia - Gestión de Aprobaciones v2.0</strong>
                        </p>
                    </td>
                </tr>
            </table>
        </div>
        `;

        // 3. Envío del correo
        await correoOutlook.sendMail({
          from: '"WAS Notificaciones" <eagudelo@woden.com.co>',
          to: usuario.correo,
          subject: "Documentos Aprobados - WAS INFO",
          html: htmlEmail,
        });

        res.json({
          status: "ok",
          message: "Notificación de aprobación enviada",
        });
      } catch (e) {
        console.error("Error al enviar correo de aprobación:", e);
        res
          .status(500)
          .json({ status: "error", message: "Error enviando correo" });
      }
    },
  );
});
router.post("/notificar-nomina", async (req, res) => {
  const { id } = req.body;

  // 1. Buscamos los datos detallados del usuario/contrato
  db.query(
    "SELECT nombres, cargo, salario, segmento_contrato, ciudad FROM usuarios WHERE id = ?",
    [id],
    async (err, users) => {
      if (err || !users || users.length === 0) {
        return res
          .status(500)
          .json({ status: "error", message: "Usuario no encontrado" });
      }

      const usuario = users[0];

      // 2. Buscamos los correos de la tabla de nómina
      db.query(
        "SELECT email FROM notificaciones_nomina",
        async (errNotif, resNotif) => {
          if (errNotif || resNotif.length === 0) {
            return res.status(404).json({
              status: "error",
              message: "No hay correos configurados en nómina",
            });
          }

          const listaCorreos = resNotif.map((r) => r.email);

          try {
            // 3. Diseño del HTML para Nómina
            const htmlNomina = `
          <div style="background-color: #f4f6f8; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e1e4e8;">
                  <tr>
                      <td style="background-color: #007bff; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Aviso de Nuevo Contrato</h1>
                      </td>
                  </tr>
                  <tr>
                      <td style="padding: 30px;">
                          <p style="font-size: 16px; color: #333;">Hola equipo de Nómina,</p>
                          <p style="font-size: 15px; color: #555;">Se ha aprobado un nuevo contrato en el sistema <strong>WAS</strong> con los siguientes detalles:</p>
                          
                          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                              <p style="margin: 5px 0;"><strong>Colaborador:</strong> ${usuario.nombres} ${usuario.apellidos}</p>
                              <p style="margin: 5px 0;"><strong>Cargo:</strong> ${usuario.cargo}</p>
                              <p style="margin: 5px 0;"><strong>Salario:</strong> $${usuario.salario}</p>
                              <p style="margin: 5px 0;"><strong>Segmento:</strong> ${usuario.segmento_contrato}</p>
                              <p style="margin: 5px 0;"><strong>Ciudad:</strong> ${usuario.ciudad}</p>
                          </div>

                          <p style="font-size: 14px; color: #777;">Por favor, proceder con el registro correspondiente en el sistema de pagos.</p>
                      </td>
                  </tr>
                  <tr>
                      <td style="background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 12px 12px;">
                          <p style="font-size: 11px; color: #999; margin: 0;">WAS CLOUD - Gestión Documental</p>
                      </td>
                  </tr>
              </table>
          </div>
          `;

            // 4. Envío de correo a la lista de nómina
            await correoOutlook.sendMail({
              from: '"WAS Sistema" <eagudelo@woden.com.co>',
              to: listaCorreos, // Envía a todos los de la tabla
              subject: `Notifiación WAS: Contrato Aprobado - ${usuario.nombres}`,
              html: htmlNomina,
            });

            res.json({
              status: "ok",
              message: "Notificación enviada a nómina",
            });
          } catch (e) {
            console.error("Error al enviar correo a nómina:", e);
            res
              .status(500)
              .json({ status: "error", message: "Error enviando correo" });
          }
        },
      );
    },
  );
});
router.post("/notificarRegistro", async (req, res) => {
  const { id } = req.body;

  // 1. Buscamos los datos detallados del usuario/contrato
  db.query(
    "SELECT nombres, apellidos FROM usuarios WHERE id = ?",
    [id],
    async (err, users) => {
      if (err || !users || users.length === 0) {
        return res
          .status(500)
          .json({ status: "error", message: "Usuario no encontrado" });
      }

      const usuario = users[0];

      // 2. Buscamos los correos de la tabla de nómina
      db.query(
        "SELECT email FROM notificaciones",
        async (errNotif, resNotif) => {
          if (errNotif || resNotif.length === 0) {
            return res.status(404).json({
              status: "error",
              message: "No hay correos configurados en nómina",
            });
          }

          const listaCorreos = resNotif.map((r) => r.email);

          try {
            // 3. Diseño del HTML para Nómina
            const htmlNomina = `
          <div style="background-color: #f4f6f8; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif;">
              <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e1e4e8;">
                  <tr>
                      <td style="background-color: #007bff; padding: 20px; text-align: center; border-radius: 12px 12px 0 0;">
                          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">Aviso de Nuevo Contrato</h1>
                      </td>
                  </tr>
                  <tr>
                      <td style="padding: 30px;">
                          <p style="font-size: 16px; color: #333;">Hola equipo de Selección,</p>
                          <p style="font-size: 15px; color: #555;">Se ha registrado un nuevo colaborador:</p>
                          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                              <p style="margin: 5px 0;"><strong>Colaborador:</strong> ${usuario.nombres} ${usuario.apellidos}</p>
                          </div>

                          <p style="font-size: 14px; color: #777;">Por favor, Validar la información del nuevo colaborador.</p>
                      </td>
                  </tr>
                  <tr>
                      <td style="background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 12px 12px;">
                          <p style="font-size: 11px; color: #999; margin: 0;">WAS CLOUD</p>
                      </td>
                  </tr>
              </table>
          </div>
          `;

            // 4. Envío de correo a la lista de nómina
            await correoOutlook.sendMail({
              from: '"WAS Sistema" <eagudelo@woden.com.co>',
              to: listaCorreos, // Envía a todos los de la tabla
              subject: `Notificacion: Nuevo Registro - ${usuario.nombres}`,
              html: htmlNomina,
            });

            res.json({
              status: "ok",
              message: "Notificación enviada",
            });
          } catch (e) {
            console.error("Error al enviar correo:", e);
            res
              .status(500)
              .json({ status: "error", message: "Error enviando correo" });
          }
        },
      );
    },
  );
});

// B. VALIDAR TOKEN
router.get("/validar-token/:token", (req, res) => {
  const token = req.params.token;
  db.query(
    "SELECT id, nombres, apellidos FROM usuarios WHERE token_subsanar = ?",
    [token],
    (err, result) => {
      if (err || result.length === 0)
        return res
          .status(404)
          .json({ status: "error", message: "Enlace inválido o expirado." });
      res.json({ status: "ok", usuario: result[0] });
    },
  );
});
router.get("/ver-archivo", async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).send("Falta el token del archivo");

  try {
    // 1. DECODIFICAR EL "HASH"
    const keyReal = Buffer.from(token, "base64").toString("utf-8");
    const nombreArchivo = keyReal.split("/").pop();
    const extension = path.extname(nombreArchivo).toLowerCase(); // Aquí usa el 'path' global

    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: keyReal,
    });

    const response = await s3Client.send(getCommand);

    // 2. DETECCIÓN DE TIPO DE CONTENIDO
    let contentType = response.ContentType;

    // Si viene genérico, forzamos según extensión
    if (!contentType || contentType.includes("octet-stream")) {
      if (extension === ".pdf") contentType = "application/pdf";
      else if (extension === ".jpg" || extension === ".jpeg")
        contentType = "image/jpeg";
      else if (extension === ".png") contentType = "image/png";
    }

    // 3. CONFIGURAR CABECERAS PARA VISUALIZACIÓN
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(nombreArchivo)}"`,
    );

    // 4. ENVIAR ARCHIVO
    response.Body.pipe(res);
  } catch (err) {
    console.error("Error streaming archivo:", err);
    res.status(404).send("Archivo no disponible.");
  }
});
// Obtener permisos del usuario
router.get("/permisos/:id", async (req, res) => {
  try {
    const [permisos] = await db.execute(
      "SELECT seccion, puede_editar FROM permisos_edicion WHERE usuario_id = ?",
      [req.params.id],
    );
    // Convertimos a un objeto fácil de usar: { gestion_contratacion: true, salario: false }
    const mapaPermisos = permisos.reduce((acc, p) => {
      acc[p.seccion] = !!p.puede_editar;
      return acc;
    }, {});
    res.json(mapaPermisos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GUARDAR O ACTUALIZAR PERMISOS
router.post("/permisos", async (req, res) => {
  const { usuario_id, permisos } = req.body;

  if (!usuario_id) {
    return res.status(400).json({ error: "Falta el ID del usuario" });
  }

  try {
    // Recorremos el objeto de permisos y generamos una promesa por cada uno
    const promesas = Object.entries(permisos).map(([seccion, puede_editar]) => {
      return new Promise((resolve, reject) => {
        // ON DUPLICATE KEY UPDATE sirve para que si ya existe el permiso, lo actualice
        const sql = `
          INSERT INTO permisos_edicion (usuario_id, seccion, puede_editar) 
          VALUES (?, ?, ?) 
          ON DUPLICATE KEY UPDATE puede_editar = VALUES(puede_editar)
        `;
        db.query(sql, [usuario_id, seccion, puede_editar ? 1 : 0], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    await Promise.all(promesas);
    res.json({ status: "ok", message: "Permisos guardados correctamente" });
  } catch (error) {
    console.error("Error en POST /permisos:", error);
    res.status(500).json({ error: "No se pudieron guardar los permisos" });
  }
});

// C. SUBIR CORRECCIÓN A S3
router.post("/subir-correccion", upload.any(), async (req, res) => {
  const { token, tipoDocumento } = req.body;

  try {
    const usuario = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM usuarios WHERE token_subsanar = ?",
        [token],
        (err, results) => {
          if (err) reject(err);
          else if (results.length === 0) resolve(null);
          else resolve(results[0]);
        },
      );
    });

    if (!usuario)
      return res
        .status(404)
        .json({ status: "error", message: "Token inválido" });

    const folderName =
      usuario.carpeta || `${usuario.nombres} ${usuario.apellidos}`.trim();
    let listaArchivos = [];

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file, index) => {
        // 1. Extraemos el nombre original sin la extensión
        const nombreBase = path.parse(file.originalname).name;
        // 2. Obtenemos la extensión (ej: .pdf, .jpg)
        const ext = path.extname(file.originalname);

        // 3. Construimos el nombre con el sufijo _sub y el identificador
        const nuevoNombre = `${nombreBase}_sub_${Date.now()}_${index}${ext}`;
        const key = `${folderName}/${nuevoNombre}`;

        listaArchivos.push(nuevoNombre);

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });

        return s3Client.send(command);
      });

      await Promise.all(uploadPromises);
    }

    db.query("UPDATE usuarios SET token_subsanar = NULL WHERE id = ?", [
      usuario.id,
    ]);

    db.query("SELECT email FROM notificaciones", async (errNotif, resNotif) => {
      if (!errNotif && resNotif.length > 0) {
        const listaCorreos = resNotif.map((r) => r.email).join(", ");
        try {
          const htmlAdmin = `
    <div style="background-color: #f0f2f5; padding: 30px; font-family: 'Segoe UI', Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 15px; overflow: hidden; border: 1px solid #e1e4e8;">
            <tr>
                <td style="background-color: #2c3e50; padding: 20px 30px; text-align: left;">
                    <table width="100%">
                        <tr>
                            <td>
                                <span style="color: #ffffff; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8;">Notificación de Sistema</span>
                                <h1 style="color: #ffffff; margin: 5px 0 0 0; font-size: 20px;">Corrección de Documentos</h1>
                            </td>
                            <td style="text-align: right;">
                                <span style="background-color: #e2712a; color: white; padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: bold;">NUEVA ACCIÓN</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <tr>
                <td style="padding: 35px 30px;">
                    <p style="font-size: 15px; color: #666; margin-bottom: 25px;">Se informa que un colaborador ha cargado nuevos soportes tras una solicitud de corrección:</p>
                    
                    <table width="100%" style="background-color: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                        <tr>
                            <td style="padding-bottom: 10px;">
                                <span style="color: #999; font-size: 12px; text-transform: uppercase;">Colaborador</span><br>
                                <strong style="color: #2c3e50; font-size: 16px;">${
                                  usuario.nombres
                                }</strong>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <span style="color: #999; font-size: 12px; text-transform: uppercase;">Archivos Recibidos</span><br>
                                <strong style="color: #e2712a; font-size: 16px;">${
                                  listaArchivos.length
                                } documento(s) cargado(s)</strong>
                            </td>
                        </tr>
                    </table>

                    <p style="font-size: 14px; color: #555; line-height: 1.5;">
                        Los archivos ya se encuentran disponibles en el servidor para su validación técnica. Por favor, ingrese al panel administrativo para revisar el estado de la solicitud.
                    </p>

                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 30px;">
                        <tr>
                        </tr>
                    </table>
                </td>
            </tr>

            <tr>
                <td style="background-color: #ffffff; padding: 20px 30px; text-align: center; border-top: 1px solid #f0f0f0;">
                    <p style="font-size: 11px; color: #bbb; margin: 0;">
                        WAS Auto-Notificaciones | ID de Transacción: ${Date.now()}<br>
                        Generado el: ${new Date().toLocaleString()}
                    </p>
                </td>
            </tr>
        </table>
    </div>
    `;

          await correoOutlook.sendMail({
            from: '"WAS Sistema" <eagudelo@woden.com.co>',
            to: listaCorreos,
            subject: `📢 Subsanación Recibida: ${usuario.nombres} ${usuario.apellidos}`,
            html: htmlAdmin,
          });
        } catch (e) {
          console.error("Error notificando admin:", e);
        }
      }
    });

    res.json({
      status: "ok",
      message: "Archivos recibidos y guardados en la nube.",
    });
  } catch (error) {
    console.error("Error en subir-correccion:", error);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
});

router.post("/vincular-cargo-pdf", async (req, res) => {
  const { idColaborador, archivoPdf, segmento } = req.body;
  try {
    const resultado = await vincularDescripcionCargo(
      idColaborador,
      archivoPdf,
      segmento,
    );
    res.json(resultado);
  } catch (error) {
    console.error("Error en servicio PDF:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
});
// Ejemplo rápido de lo que debería recibir tu API
// Esta es la ruta corregida y validada
router.post(
  "/upload-documento-colaborador",
  upload.single("file"), // Usamos el 'upload' básico que declaraste arriba
  async (req, res) => {
    try {
      const file = req.file;
      const { idColaborador, rutaDestino } = req.body;

      if (!file) {
        return res
          .status(400)
          .json({ status: "error", message: "No se recibió archivo" });
      }

      // IMPORTANTE: Limpiamos el nombre para evitar errores en el token Base64
      const nombreLimpio = file.originalname.replace(/\s+/g, "_");

      // SOLUCIÓN AL ERROR DE CARGA:
      // Subimos directamente a 'rutaDestino' (que es la carpeta del usuario)
      // SIN agregar '/contratos_generados' para que la cuadrícula inferior lo vea.
      const keyFinal = `${rutaDestino}/${nombreLimpio}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: keyFinal,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      res.json({
        status: "success",
        message: "Archivo cargado correctamente",
        nombre: nombreLimpio,
        key: keyFinal,
      });
    } catch (error) {
      console.error("Error en upload:", error);
      res.status(500).json({ status: "error", message: error.toString() });
    }
  },
);
const mime = require("mime-types");
router.post("/renombrar-archivo-s3", async (req, res) => {
  const { carpeta, nombreActual, nuevoNombre } = req.body;

  try {
    const ext = path.extname(nombreActual);
    let nombreFinal = nuevoNombre.replace(/\s+/g, "_");
    if (!nombreFinal.toLowerCase().endsWith(ext.toLowerCase())) {
      nombreFinal += ext;
    }

    const oldKey = `${carpeta}/${nombreActual}`;
    const newKey = `${carpeta}/${nombreFinal}`;

    // DETECTAR EL TIPO DE ARCHIVO (Importante para que no se descargue)
    const contentType = mime.lookup(nombreFinal) || "application/pdf";

    // 1. Copiar objeto con METADATOS NUEVOS
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: encodeURIComponent(`${BUCKET_NAME}/${oldKey}`), // S3 requiere encode en CopySource
        Key: newKey,
        ContentType: contentType, // Forzamos el tipo de contenido
        MetadataDirective: "REPLACE", // Obligamos a S3 a usar el nuevo ContentType
      }),
    );

    // 2. Eliminar original
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldKey,
      }),
    );

    res.json({ status: "success", nuevoNombre: nombreFinal });
  } catch (error) {
    console.error("Error al renombrar:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});
// C. SUBIR DOCUMENTOS FIRMADOS (Acción del Colaborador)
router.post("/subir-firmados", upload.any(), async (req, res) => {
  const { token } = req.body;

  try {
    // 1. Validar que el token de firma exista y sea válido
    const usuario = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM usuarios WHERE token_firma = ?",
        [token],
        (err, results) => {
          if (err) reject(err);
          else if (results.length === 0) resolve(null);
          else resolve(results[0]);
        },
      );
    });

    if (!usuario) {
      return res.status(404).json({
        status: "error",
        message: "Enlace de firma inválido o expirado",
      });
    }

    const folderName =
      usuario.carpeta ||
      `${usuario.nombres}_${usuario.apellidos}`.replace(/\s+/g, "_");

    if (req.files && req.files.length > 0) {
      // 2. Subir archivos a S3
      const uploadPromises = req.files.map((file) => {
        const ext = path.extname(file.originalname);
        const nombreLimpio = path
          .basename(file.originalname, ext)
          .replace(/\s+/g, "_");
        const nuevoNombre = `${nombreLimpio}_${Date.now()}${ext}`;
        const s3Key = `${folderName}/documentos_firmados/${nuevoNombre}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype,
        });
        return s3Client.send(command);
      });

      await Promise.all(uploadPromises);

      // --- INICIO DE LÓGICA DE NOTIFICACIÓN ---
      db.query(
        "SELECT email FROM notificaciones",
        async (errNotif, resNotif) => {
          if (!errNotif && resNotif.length > 0) {
            const listaCorreos = resNotif.map((r) => r.email).join(", ");
            try {
              const htmlAdmin = `
              <div style="background-color: #f0f2f5; padding: 30px; font-family: 'Segoe UI', Arial, sans-serif;">
                  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 15px; overflow: hidden; border: 1px solid #e1e4e8;">
                      <tr>
                          <td style="background-color: #2c3e50; padding: 20px 30px; text-align: left;">
                              <h1 style="color: #ffffff; margin: 5px 0 0 0; font-size: 20px;">Documentos Firmados Recibidos</h1>
                          </td>
                      </tr>
                      <tr>
                          <td style="padding: 35px 30px;">
                              <p style="font-size: 15px; color: #666; margin-bottom: 25px;">Se informa que un colaborador ha completado el proceso de firma y cargado sus documentos:</p>
                              <table width="100%" style="background-color: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
                                  <tr>
                                      <td style="padding-bottom: 10px;">
                                          <span style="color: #999; font-size: 12px; text-transform: uppercase;">Colaborador</span><br>
                                          <strong style="color: #2c3e50; font-size: 16px;">${usuario.nombres} ${usuario.apellidos}</strong>
                                      </td>
                                  </tr>
                                  <tr>
                                      <td>
                                          <span style="color: #999; font-size: 12px; text-transform: uppercase;">Archivos Cargados</span><br>
                                          <strong style="color: #e2712a; font-size: 16px;">${req.files.length} documento(s)</strong>
                                      </td>
                                  </tr>
                              </table>
                              <p style="font-size: 14px; color: #555; line-height: 1.5;">Los archivos se han organizado en la carpeta: <b>${folderName}/documentos_firmados/</b></p>
                          </td>
                      </tr>
                      <tr>
                          <td style="background-color: #ffffff; padding: 20px 30px; text-align: center; border-top: 1px solid #f0f0f0;">
                              <p style="font-size: 11px; color: #bbb; margin: 0;">WAS Auto-Notificaciones | Generado el: ${new Date().toLocaleString()}</p>
                          </td>
                      </tr>
                  </table>
              </div>`;

              await correoOutlook.sendMail({
                from: '"WAS Sistema" <eagudelo@woden.com.co>',
                to: listaCorreos,
                subject: `✅ Firma Completada: ${usuario.nombres} ${usuario.apellidos}`,
                html: htmlAdmin,
              });
            } catch (e) {
              console.error("Error enviando correo de notificación:", e);
            }
          }
        },
      );
      // --- FIN DE LÓGICA DE NOTIFICACIÓN ---

      res.json({
        status: "ok",
        message: "Documentos firmados cargados y notificados exitosamente.",
      });
    } else {
      res
        .status(400)
        .json({ status: "error", message: "No se recibieron archivos." });
    }
  } catch (error) {
    console.error("Error en subir-firmados:", error);
    res.status(500).json({
      status: "error",
      message: "Error interno al procesar la subida",
    });
  }
});
// VALIDAR TOKEN DE FIRMA
router.get("/validar-token-firma/:token", (req, res) => {
  const token = req.params.token;
  db.query(
    "SELECT id, nombres, apellidos FROM usuarios WHERE token_firma = ?",
    [token],
    (err, result) => {
      if (err)
        return res
          .status(500)
          .json({ status: "error", message: "Error en base de datos" });

      if (result.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "El enlace es inválido o ya fue utilizado.",
        });
      }

      res.json({ status: "ok", usuario: result[0] });
    },
  );
});
// --- ENDPOINT PARA GENERAR TOKEN Y ENVIAR EMAIL DE FIRMA ---
router.post("/solicitar-firma-contratos", async (req, res) => {
  // Agregamos async aquí
  const { id, correo, nombres, archivosAFirmar } = req.body;
  const token = crypto.randomBytes(20).toString("hex");

  db.query(
    "UPDATE usuarios SET token_firma = ?, fecha_solicitud_firma = NOW() WHERE id = ?",
    [token, id],
    async (err) => {
      if (err)
        return res.status(500).json({ status: "error", message: err.message });

      const link = `${URL_BASEDEV}/firmar.html?token=${token}`;

      // 1. GENERAR ADJUNTOS (Esto es lo que te faltaba)
      let attachments = [];
      try {
        attachments = await Promise.all(
          archivosAFirmar.map(async (file) => {
            const response = await axios.get(file.url, {
              responseType: "arraybuffer",
            });
            return {
              filename: file.name,
              content: Buffer.from(response.data),
            };
          }),
        );
      } catch (e) {
        console.error("Error descargando adjuntos:", e);
        // Puedes decidir si fallar o enviar el correo sin adjuntos
      }

      const listaHtml = archivosAFirmar
        .map((a) => `<li>📄 ${a.name}</li>`)
        .join("");

      const htmlEmail = `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
                    <div style="background-color: #1e3a8a; color: white; padding: 20px; text-align: center;">
                        <h2 style="margin: 0;">WAS FIRMA</h2>
                    </div>
                    <div style="padding: 30px;">
                        <h3>Hola, ${nombres}</h3>
                        <p>Se han generado tus documentos de contratación. Por favor, descárgalos, fírmalos y súbelos escaneados a través del siguiente enlace:</p>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <strong style="color: #1e3a8a;">Documentos a firmar:</strong>
                            <ul style="margin: 10px 0; padding-left: 20px;">
                                ${listaHtml}
                            </ul>
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${link}" style="background-color: #0891b2; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                ✍️ SUBIR DOCUMENTOS FIRMADOS
                            </a>
                        </div>
                    </div>
                </div>
            `;

      try {
        await correoOutlook.sendMail({
          from: '"WAS Contratación" <eagudelo@woden.com.co>',
          to: correo,
          subject: "📝 Acción Requerida: Firma de Contratos - WAS",
          html: htmlEmail,
          attachments: attachments, // <--- INDISPENSABLE: Aquí se anexan los archivos
        });
        res.json({ status: "ok", message: "Solicitud enviada con archivos" });
      } catch (e) {
        console.error("Error enviando correo:", e);
        res
          .status(500)
          .json({ status: "error", message: "No se pudo enviar el correo" });
      }
    },
  );
});

// GET /api/listar-firmados/:carpeta
router.get("/listar-firmados/:carpeta", async (req, res) => {
  const carpetaUsuario = req.params.carpeta;

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${carpetaUsuario}/documentos_firmados/`, // Solo busca en esa subcarpeta
    });

    const response = await s3Client.send(command);

    const filesPromises = (response.Contents || [])
      .filter((item) => !item.Key.endsWith("/")) // Ignorar el objeto de la carpeta misma
      .map(async (item) => {
        const fileName = item.Key.split("/").pop();

        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: item.Key,
        });

        const signedUrl = await getSignedUrl(s3Client, getCommand, {
          expiresIn: 3600,
        });

        return {
          name: fileName,
          url: signedUrl,
          key: Buffer.from(item.Key).toString("base64"), // Token para ver-archivo
        };
      });

    const files = await Promise.all(filesPromises);
    res.json(files);
  } catch (err) {
    console.error("Error listando firmados:", err);
    res.json([]);
  }
});

module.exports = router;
