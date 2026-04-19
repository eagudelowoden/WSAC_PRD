const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const mime = require("mime-types");
const fs = require("fs");
const db = require("../databases/db");
const {
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { s3Client, BUCKET_NAME } = require("../services/s3Config");
const { registrarActividad } = require("../middlewares/auth");

const upload = multer({ storage: multer.memoryStorage() });

// ⚠️ IMPORTANTE: /ver-archivo DEBE ir antes de /:carpeta
router.get("/ver-archivo", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Falta el token del archivo");

  try {
    const keyReal = Buffer.from(token, "base64").toString("utf-8");
    const nombreArchivo = keyReal.split("/").pop();
    const extension = path.extname(nombreArchivo).toLowerCase();

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: keyReal,
      }),
    );

    let contentType = response.ContentType;
    if (!contentType || contentType.includes("octet-stream")) {
      if (extension === ".pdf") contentType = "application/pdf";
      else if ([".jpg", ".jpeg"].includes(extension))
        contentType = "image/jpeg";
      else if (extension === ".png") contentType = "image/png";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(nombreArchivo)}"`,
    );
    response.Body.pipe(res);
  } catch (err) {
    console.error("Error streaming archivo:", err);
    res.status(404).send("Archivo no disponible.");
  }
});

// /listar-firmados también debe ir antes de /:carpeta
router.get("/listar-firmados/:carpeta", async (req, res) => {
  const carpetaUsuario = req.params.carpeta;
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${carpetaUsuario}/documentos_firmados/`,
      }),
    );

    const files = await Promise.all(
      (response.Contents || [])
        .filter((item) => !item.Key.endsWith("/"))
        .map(async (item) => {
          const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: item.Key,
            }),
            { expiresIn: 3600 },
          );
          return {
            name: item.Key.split("/").pop(),
            url: signedUrl,
            key: Buffer.from(item.Key).toString("base64"),
          };
        }),
    );
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// /:carpeta va de ÚLTIMO entre los GET
router.get("/:carpeta", async (req, res) => {
  const carpetaPrincipal = req.params.carpeta;
  const sub = req.query.sub;
  const prefijoFinal = sub
    ? `${carpetaPrincipal}/${sub}/`
    : `${carpetaPrincipal}/`;

  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefijoFinal,
      }),
    );

    const files = await Promise.all(
      (response.Contents || [])
        .filter(
          (item) => !item.Key.endsWith("/") && item.Key.split("/").pop() !== "",
        )
        .map(async (item) => {
          const signedUrl = await getSignedUrl(
            s3Client,
            new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: item.Key,
            }),
            { expiresIn: 3600 },
          );
          return { name: item.Key.split("/").pop(), url: signedUrl };
        }),
    );
    res.json(files);
  } catch (err) {
    console.error("Error listando archivos S3:", err);
    res.json([]);
  }
});

// POSTs y DELETEs (el orden no importa tanto aquí)
router.post(
  "/upload-documento-colaborador",
  registrarActividad("Subir documento colaborador"),
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      const { rutaDestino } = req.body;
      if (!file)
        return res
          .status(400)
          .json({ status: "error", message: "No se recibió archivo" });

      const nombreLimpio = file.originalname.replace(/\s+/g, "_");
      const keyFinal = `${rutaDestino}/${nombreLimpio}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: keyFinal,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      res.json({ status: "success", nombre: nombreLimpio, key: keyFinal });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.toString() });
    }
  },
);

router.post(
  "/renombrar-archivo-s3",
  registrarActividad("Renombrar archivo S3"),
  async (req, res) => {
    const { carpeta, nombreActual, nuevoNombre } = req.body;
    try {
      const ext = path.extname(nombreActual);
      let nombreFinal = nuevoNombre.replace(/\s+/g, "_");
      if (!nombreFinal.toLowerCase().endsWith(ext.toLowerCase()))
        nombreFinal += ext;

      const oldKey = `${carpeta}/${nombreActual}`;
      const newKey = `${carpeta}/${nombreFinal}`;
      const contentType = mime.lookup(nombreFinal) || "application/pdf";

      await s3Client.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: encodeURIComponent(`${BUCKET_NAME}/${oldKey}`),
          Key: newKey,
          ContentType: contentType,
          MetadataDirective: "REPLACE",
        }),
      );
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: oldKey }),
      );

      res.json({ status: "success", nuevoNombre: nombreFinal });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  },
);

router.delete(
  "/eliminar-archivo",
  registrarActividad("Eliminar archivo"), // El middleware ahora recibirá el query en lugar del body
  async (req, res) => {
    // Intentamos obtener la key del body O del query (por si acaso)
    const key = req.body.key || req.query.key;

    if (!key) {
      return res.status(400).json({
        status: "error",
        message: "Falta la clave (key) del archivo",
      });
    }

    try {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      );

      res.json({ status: "ok", message: "Archivo eliminado de S3" });
    } catch (error) {
      console.error("Error S3:", error);
      res
        .status(500)
        .json({ status: "error", message: "No se pudo eliminar el objeto" });
    }
  },
);
router.post("/enviar", upload.any(), async (req, res) => {
  const data = req.body;
  const safeData = {
    ...data,
    afiliacionesFamiliares: data.afiliacionesFamiliares || "",
    observaciones: data.observaciones || "",
  };

  const fullName = `${safeData.nombres} ${safeData.apellidos}`.trim();

  // ── 1. SUBIR ARCHIVOS A S3 ──────────────────────────────────
  if (req.files && req.files.length > 0) {
    const uploads = req.files.map(async (file) => {
      const s3Key = `${fullName}/${file.fieldname}_${file.originalname}`;
      try {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
        // Borrar el temporal local después de subir
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`❌ Error subiendo ${file.originalname} a S3:`, err);
      }
    });

    await Promise.all(uploads);
  }

  // ── 2. GUARDAR EN BASE DE DATOS ─────────────────────────────
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

  db.query(sql, valores, async (err, result) => {
    if (err) {
      console.error("❌ Error SQL:", err);
      return res.status(500).json({ status: "error", message: err.message });
    }

    const nuevoId = result.insertId;

    // ── 3. CORREO DE CONFIRMACIÓN AL COLABORADOR ────────────
    try {
      await req.transporter.sendMail({
        from: `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
        to: safeData.correo,
        subject: "Registro exitoso",
        html: `
          <h3>Hola ${safeData.nombres},</h3>
          <p>Tus documentos han sido recibidos correctamente en el sistema.</p>
          <p>Pronto te contactaremos.</p>
        `,
      });
    } catch (e) {
      console.error("⚠️ Error enviando correo al colaborador:", e);
    }

    // ── 4. RESPUESTA AL FRONTEND ────────────────────────────
    res.status(200).json({
      status: "ok",
      message: "Registro exitoso.",
      id: nuevoId,
    });
  });
});

module.exports = router;
