const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const db = require("../databases/db");
const nodemailer = require("nodemailer");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client, BUCKET_NAME } = require("../services/s3Config");
const { registrarActividad } = require("../middlewares/auth");

const upload = multer({ storage: multer.memoryStorage() });
const URL_BASE = process.env.URL_BASE;
const URL_BASEDEV =
  process.env.URL_BASEDEV || `http://localhost:${process.env.PORT}`;

const correoOutlook = nodemailer.createTransport({
  host: process.env.OUTLOOK_HOST,
  port: parseInt(process.env.OUTLOOK_PORT),
  secure: process.env.OUTLOOK_SECURE === "true",
  requireTLS: process.env.OUTLOOK_REQUIRE_TLS === "true",
  auth: { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

// Solicitar subsanación
router.post(
  "/solicitar-subsanar",
  registrarActividad("Solicitar subsanación"),
  (req, res) => {
    const { id, motivo } = req.body;
    const token = crypto.randomBytes(20).toString("hex");

    db.query(
      "UPDATE usuarios SET token_subsanar=?, fecha_solicitud_subsanar=NOW() WHERE id=?",
      [token, id],
      (err) => {
        if (err)
          return res
            .status(500)
            .json({ status: "error", message: err.message });

        db.query(
          "SELECT nombres, correo FROM usuarios WHERE id=?",
          [id],
          async (err, users) => {
            if (!users?.length)
              return res
                .status(404)
                .json({ status: "error", message: "Usuario no encontrado" });

            const u = users[0];
            const link = `${URL_BASE}/subsanar.html?token=${token}`;

            try {
              await correoOutlook.sendMail({
                from: `"WSAC Notificaciones" <${process.env.OUTLOOK_USER}>`,
                to: u.correo,
                subject: "Acción Requerida: Corregir Documentos - WSAC",
                html: `
              <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;">
                <div style="background:#e2712a;padding:20px;text-align:center;">
                  <h1 style="color:white;margin:0;">WSAC CLOUD</h1>
                </div>
                <div style="padding:30px;">
                  <h2>¡Hola, ${u.nombres}!</h2>
                  <p>Se requiere una corrección en tus documentos.</p>
                  <div style="background:#fff4ed;border-left:4px solid #e2712a;padding:15px;margin:20px 0;">
                    <strong>Motivo:</strong> ${motivo}
                  </div>
                  <a href="${link}" style="background:#2c3e50;color:white;padding:15px 35px;text-decoration:none;border-radius:8px;display:inline-block;">
                    SUBIR DOCUMENTOS
                  </a>
                </div>
              </div>`,
              });
              res.json({
                status: "ok",
                message: "Solicitud enviada al usuario",
              });
            } catch (e) {
              res
                .status(500)
                .json({ status: "error", message: "Error enviando correo" });
            }
          },
        );
      },
    );
  },
);

// Validar token de subsanación
router.get("/validar-token/:token", (req, res) => {
  db.query(
    "SELECT id, nombres, apellidos FROM usuarios WHERE token_subsanar=?",
    [req.params.token],
    (err, result) => {
      if (err || !result.length)
        return res
          .status(404)
          .json({ status: "error", message: "Enlace inválido o expirado." });
      res.json({ status: "ok", usuario: result[0] });
    },
  );
});

// Subir corrección
router.post("/subir-correccion", upload.any(), async (req, res) => {
  const { token } = req.body;

  try {
    const usuario = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM usuarios WHERE token_subsanar=?",
        [token],
        (err, results) => (err ? reject(err) : resolve(results[0] || null)),
      );
    });

    if (!usuario)
      return res
        .status(404)
        .json({ status: "error", message: "Token inválido" });

    const folderName =
      usuario.carpeta || `${usuario.nombres} ${usuario.apellidos}`.trim();

    if (req.files?.length) {
      await Promise.all(
        req.files.map((file, index) => {
          const ext = path.extname(file.originalname);
          const base = path.parse(file.originalname).name;
          const key = `${folderName}/${base}_sub_${Date.now()}_${index}${ext}`;
          return s3Client.send(
            new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            }),
          );
        }),
      );
    }

    db.query("UPDATE usuarios SET token_subsanar=NULL WHERE id=?", [
      usuario.id,
    ]);

    // Notificar a admins
    db.query("SELECT email FROM notificaciones", async (err, notifs) => {
      if (!err && notifs?.length) {
        try {
          await correoOutlook.sendMail({
            from: `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
            to: notifs.map((r) => r.email).join(", "),
            subject: `📢 Subsanación Recibida: ${usuario.nombres} ${usuario.apellidos}`,
            html: `<p>El colaborador <strong>${usuario.nombres}</strong> ha cargado ${req.files?.length || 0} documento(s) corregido(s).</p>`,
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
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor" });
  }
});

// Validar token de firma
router.get("/validar-token-firma/:token", (req, res) => {
  db.query(
    "SELECT id, nombres, apellidos FROM usuarios WHERE token_firma=?",
    [req.params.token],
    (err, result) => {
      if (err)
        return res
          .status(500)
          .json({ status: "error", message: "Error en BD" });
      if (!result.length)
        return res.status(404).json({
          status: "error",
          message: "Enlace inválido o ya utilizado.",
        });
      res.json({ status: "ok", usuario: result[0] });
    },
  );
});

// Solicitar firma de contratos
router.post(
  "/solicitar-firma-contratos",
  registrarActividad("Solicitar firma de contratos"),
  async (req, res) => {
    const { id, correo, nombres, archivosAFirmar } = req.body;
    const token = crypto.randomBytes(20).toString("hex");

    db.query(
      "UPDATE usuarios SET token_firma=?, fecha_solicitud_firma=NOW() WHERE id=?",
      [token, id],
      async (err) => {
        if (err)
          return res
            .status(500)
            .json({ status: "error", message: err.message });

        const link = `${URL_BASEDEV}/firmar.html?token=${token}`;
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
        }

        try {
          await correoOutlook.sendMail({
            from: `"WSAC Contratación" <${process.env.OUTLOOK_USER}>`,
            to: correo,
            subject: "📝 Acción Requerida: Firma de Contratos - WSAC",
            html: `
              <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;">
                <div style="background:#1e3a8a;padding:20px;text-align:center;color:white;">
                  <h2 style="margin:0;">WSAC FIRMA</h2>
                </div>
                <div style="padding:30px;">
                  <h3>Hola, ${nombres}</h3>
                  <p>Descarga, firma y sube tus documentos:</p>
                  <ul>${archivosAFirmar.map((a) => `<li>📄 ${a.name}</li>`).join("")}</ul>
                  <a href="${link}" style="background:#0891b2;color:white;padding:15px 25px;text-decoration:none;border-radius:8px;display:inline-block;">
                    ✍️ SUBIR DOCUMENTOS FIRMADOS
                  </a>
                </div>
              </div>`,
            attachments,
          });
          res.json({ status: "ok", message: "Solicitud enviada con archivos" });
        } catch (e) {
          res
            .status(500)
            .json({ status: "error", message: "No se pudo enviar el correo" });
        }
      },
    );
  },
);

// Subir documentos firmados
router.post("/subir-firmados", upload.any(), async (req, res) => {
  const { token } = req.body;

  try {
    const usuario = await new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM usuarios WHERE token_firma=?",
        [token],
        (err, results) => (err ? reject(err) : resolve(results[0] || null)),
      );
    });

    if (!usuario)
      return res.status(404).json({
        status: "error",
        message: "Enlace de firma inválido o expirado",
      });

    const folderName =
      usuario.carpeta ||
      `${usuario.nombres}_${usuario.apellidos}`.replace(/\s+/g, "_");

    if (!req.files?.length)
      return res
        .status(400)
        .json({ status: "error", message: "No se recibieron archivos." });

    await Promise.all(
      req.files.map((file) => {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
        const key = `${folderName}/documentos_firmados/${base}_${Date.now()}${ext}`;
        return s3Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
      }),
    );

    // Notificar admins
    db.query("SELECT email FROM notificaciones", async (err, notifs) => {
      if (!err && notifs?.length) {
        try {
          await correoOutlook.sendMail({
            from: `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
            to: notifs.map((r) => r.email).join(", "),
            subject: `✅ Firma Completada: ${usuario.nombres} ${usuario.apellidos}`,
            html: `<p><strong>${usuario.nombres} ${usuario.apellidos}</strong> completó la firma y cargó ${req.files.length} documento(s).</p>`,
          });
        } catch (e) {
          console.error("Error enviando correo:", e);
        }
      }
    });

    res.json({
      status: "ok",
      message: "Documentos firmados cargados exitosamente.",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error interno" });
  }
});

module.exports = router;
