const express = require("express");
const router  = express.Router();
const path    = require("path");
const multer  = require("multer");
const mime    = require("mime-types");
const fs      = require("fs");
const db      = require("../databases/knex");
const {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl }              = require("@aws-sdk/s3-request-presigner");
const { s3Client, BUCKET_NAME }     = require("../services/s3Config");
const { registrarActividad, verificarAuth } = require("../middlewares/auth");

const MB     = 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fileSize: 20 * MB, files: 30 }, // máx 20 MB por archivo, 30 archivos
  fileFilter(req, file, cb) {
    const allowed = /pdf|docx?|jpe?g|png|xlsx?/i;
    allowed.test(file.mimetype) || allowed.test(file.originalname)
      ? cb(null, true)
      : cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
  },
});

// Todas las rutas de archivos requieren sesión autenticada
router.use(verificarAuth);

// ⚠️ /ver-archivo y /listar-firmados ANTES de /:carpeta

router.get("/ver-archivo", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Falta el token del archivo");

  try {
    const keyReal       = Buffer.from(token, "base64").toString("utf-8");
    const nombreArchivo = keyReal.split("/").pop();
    const extension     = path.extname(nombreArchivo).toLowerCase();
    const response      = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: keyReal }));

    let contentType = response.ContentType;
    if (!contentType || contentType.includes("octet-stream")) {
      if (extension === ".pdf")                        contentType = "application/pdf";
      else if ([".jpg", ".jpeg"].includes(extension)) contentType = "image/jpeg";
      else if (extension === ".png")                   contentType = "image/png";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(nombreArchivo)}"`);
    response.Body.pipe(res);
  } catch {
    res.status(404).send("Archivo no disponible.");
  }
});

router.get("/listar-firmados/:carpeta", async (req, res) => {
  try {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: `${req.params.carpeta}/documentos_firmados/`,
    }));

    const files = await Promise.all(
      (response.Contents || [])
        .filter((item) => !item.Key.endsWith("/"))
        .map(async (item) => {
          const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.Key }),
            { expiresIn: 3600 },
          );
          return { name: item.Key.split("/").pop(), url: signedUrl, key: Buffer.from(item.Key).toString("base64") };
        }),
    );
    res.json(files);
  } catch {
    res.json([]);
  }
});

router.get("/:carpeta", async (req, res, next) => {
  const { carpeta } = req.params;
  const sub         = req.query.sub;
  const prefijo     = sub ? `${carpeta}/${sub}/` : `${carpeta}/`;

  try {
    const response = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefijo }));

    const files = await Promise.all(
      (response.Contents || [])
        .filter((item) => !item.Key.endsWith("/") && item.Key.split("/").pop() !== "")
        .map(async (item) => {
          const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: item.Key }),
            { expiresIn: 3600 },
          );
          return { name: item.Key.split("/").pop(), url: signedUrl };
        }),
    );
    res.json(files);
  } catch (err) {
    console.error("❌ S3 listar archivos:", err.message);
    res.status(502).json({ status: "error", message: "No se pudieron cargar los archivos. Intenta de nuevo." });
  }
});

router.post("/upload-documento-colaborador", registrarActividad("Subir documento colaborador"), upload.single("file"), async (req, res, next) => {
  // Multer envía el error de fileSize como err.code === 'LIMIT_FILE_SIZE'
  if (req.fileValidationError)
    return res.status(400).json({ status: "error", message: req.fileValidationError });

  try {
    const file = req.file;
    if (!file) return res.status(400).json({ status: "error", message: "No se recibió archivo" });

    const nombreLimpio = file.originalname.replace(/\s+/g, "_");
    const keyFinal     = `${req.body.rutaDestino}/${nombreLimpio}`;

    await s3Client.send(new PutObjectCommand({
      Bucket     : BUCKET_NAME,
      Key        : keyFinal,
      Body       : file.buffer,
      ContentType: file.mimetype,
    }));

    res.json({ status: "success", nombre: nombreLimpio, key: keyFinal });
  } catch (err) { next(err); }
});

router.post("/renombrar-archivo-s3", registrarActividad("Renombrar archivo S3"), async (req, res, next) => {
  const { carpeta, nombreActual, nuevoNombre } = req.body;
  try {
    const ext         = path.extname(nombreActual);
    let   nombreFinal = nuevoNombre.replace(/\s+/g, "_");
    if (!nombreFinal.toLowerCase().endsWith(ext.toLowerCase())) nombreFinal += ext;

    const oldKey      = `${carpeta}/${nombreActual}`;
    const newKey      = `${carpeta}/${nombreFinal}`;
    const contentType = mime.lookup(nombreFinal) || "application/pdf";

    await s3Client.send(new CopyObjectCommand({
      Bucket          : BUCKET_NAME,
      CopySource      : encodeURIComponent(`${BUCKET_NAME}/${oldKey}`),
      Key             : newKey,
      ContentType     : contentType,
      MetadataDirective: "REPLACE",
    }));
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: oldKey }));

    res.json({ status: "success", nuevoNombre: nombreFinal });
  } catch (err) { next(err); }
});

router.delete("/eliminar-archivo", registrarActividad("Eliminar archivo"), async (req, res, next) => {
  const key = req.body.key || req.query.key;
  if (!key) return res.status(400).json({ status: "error", message: "Falta la clave (key) del archivo" });

  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    res.json({ status: "ok", message: "Archivo eliminado de S3" });
  } catch (err) { next(err); }
});

router.post("/enviar", upload.any(), async (req, res, next) => {
  const data     = req.body;
  const safeData = { ...data, afiliacionesFamiliares: data.afiliacionesFamiliares || "", observaciones: data.observaciones || "" };
  const fullName = `${safeData.nombres} ${safeData.apellidos}`.trim();

  // Subir archivos a S3
  if (req.files?.length) {
    await Promise.all(req.files.map(async (file) => {
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket     : BUCKET_NAME,
          Key        : `${fullName}/${file.originalname}`,
          Body       : file.buffer,
          ContentType: file.mimetype,
        }));
      } catch { /* no crítico */ }
    }));
  }

  try {
    const [result] = await db("usuarios").insert({
      nombres              : safeData.nombres,
      apellidos            : safeData.apellidos,
      documento            : safeData.documento,
      telefono             : safeData.telefono,
      direccion            : safeData.direccion,
      correo               : safeData.correo,
      fechaNacimiento      : safeData.fechaNacimiento,
      afiliaciones_familiares: safeData.afiliacionesFamiliares,
      eps                  : safeData.epsNombre,
      arl                  : safeData.arlNombre,
      afp                  : safeData.afpNombre,
      ccf                  : safeData.ccfNombre,
      carpeta              : fullName,
    });

    // Correo de confirmación al colaborador (best-effort)
    req.transporter?.sendMail({
      from   : `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
      to     : safeData.correo,
      subject: "Registro exitoso",
      html   : `<h3>Hola ${safeData.nombres},</h3><p>Tus documentos han sido recibidos correctamente.</p>`,
    }).catch(() => {});

    res.status(200).json({ status: "ok", message: "Registro exitoso.", id: result });
  } catch (err) { next(err); }
});

module.exports = router;
