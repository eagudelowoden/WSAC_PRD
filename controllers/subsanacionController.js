const crypto = require("crypto");
const path   = require("path");
const axios  = require("axios");
const db     = require("../databases/knex");
const transporter = require("../config/mailer");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client, BUCKET_NAME } = require("../services/s3Config");

const URL_BASE    = process.env.URL_BASE;
const URL_BASEDEV = process.env.URL_BASEDEV || `http://localhost:${process.env.PORT}`;

async function solicitarSubsanar(req, res, next) {
  const { id, motivo } = req.body;
  const token = crypto.randomBytes(20).toString("hex");

  try {
    await db("usuarios").where({ id }).update({
      token_subsanar          : token,
      fecha_solicitud_subsanar: db.fn.now(),
    });

    const [users] = await db.raw("SELECT nombres, correo FROM usuarios WHERE id = ?", [id]);
    if (!users.length) return res.status(404).json({ status: "error", message: "Usuario no encontrado" });

    const u    = users[0];
    const link = `${URL_BASE}/subsanar.html?token=${token}`;

    await transporter.sendMail({
      from   : `"WSAC Notificaciones" <${process.env.OUTLOOK_USER}>`,
      to     : u.correo,
      subject: "Acción Requerida: Corregir Documentos - WSAC",
      html   : `
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
    res.json({ status: "ok", message: "Solicitud enviada al usuario" });
  } catch (err) { next(err); }
}

async function validarTokenSubsanar(req, res, next) {
  try {
    const [rows] = await db.raw(
      `SELECT id, nombres, apellidos, fecha_solicitud_subsanar
       FROM usuarios
       WHERE token_subsanar = ?
         AND fecha_solicitud_subsanar >= NOW() - INTERVAL 72 HOUR`,
      [req.params.token],
    );
    if (!rows.length)
      return res.status(404).json({ status: "error", message: "Enlace inválido o expirado (72 h)." });
    res.json({ status: "ok", usuario: rows[0] });
  } catch (err) { next(err); }
}

async function subirCorreccion(req, res, next) {
  const { token } = req.body;
  try {
    const [rows] = await db.raw("SELECT * FROM usuarios WHERE token_subsanar = ?", [token]);
    const usuario = rows[0];
    if (!usuario) return res.status(404).json({ status: "error", message: "Token inválido" });

    const folderName = usuario.carpeta || `${usuario.nombres} ${usuario.apellidos}`.trim();

    if (req.files?.length) {
      await Promise.all(req.files.map((file, index) => {
        const ext  = path.extname(file.originalname);
        const base = path.parse(file.originalname).name;
        return s3Client.send(new PutObjectCommand({
          Bucket     : BUCKET_NAME,
          Key        : `${folderName}/${base}_sub_${Date.now()}_${index}${ext}`,
          Body       : file.buffer,
          ContentType: file.mimetype,
        }));
      }));
    }

    await db("usuarios").where({ id: usuario.id }).update({ token_subsanar: null });

    // Notificar admins (best-effort)
    const emails = await db("notificaciones").pluck("email");
    if (emails.length) {
      transporter.sendMail({
        from   : `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
        to     : emails.join(", "),
        subject: `📢 Subsanación Recibida: ${usuario.nombres} ${usuario.apellidos}`,
        html   : `<p>El colaborador <strong>${usuario.nombres}</strong> ha cargado ${req.files?.length || 0} documento(s) corregido(s).</p>`,
      }).catch(() => {});
    }

    res.json({ status: "ok", message: "Archivos recibidos y guardados en la nube." });
  } catch (err) { next(err); }
}

async function validarTokenFirma(req, res, next) {
  try {
    const [rows] = await db.raw(
      `SELECT id, nombres, apellidos
       FROM usuarios
       WHERE token_firma = ?
         AND fecha_solicitud_firma >= NOW() - INTERVAL 72 HOUR`,
      [req.params.token],
    );
    if (!rows.length)
      return res.status(404).json({ status: "error", message: "Enlace inválido o expirado (72 h)." });
    res.json({ status: "ok", usuario: rows[0] });
  } catch (err) { next(err); }
}

async function solicitarFirmaContratos(req, res, next) {
  const { id, correo, nombres, archivosAFirmar } = req.body;
  const token = crypto.randomBytes(20).toString("hex");

  try {
    await db("usuarios").where({ id }).update({ token_firma: token, fecha_solicitud_firma: db.fn.now() });

    const link        = `${URL_BASEDEV}/firmar.html?token=${token}`;
    let   attachments = [];

    try {
      attachments = await Promise.all(
        archivosAFirmar.map(async (file) => {
          const response = await axios.get(file.url, { responseType: "arraybuffer" });
          return { filename: file.name, content: Buffer.from(response.data) };
        }),
      );
    } catch { /* adjuntos no críticos */ }

    await transporter.sendMail({
      from       : `"WSAC Contratación" <${process.env.OUTLOOK_USER}>`,
      to         : correo,
      subject    : "📝 Acción Requerida: Firma de Contratos - WSAC",
      attachments,
      html       : `
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
    });
    res.json({ status: "ok", message: "Solicitud enviada con archivos" });
  } catch (err) { next(err); }
}

async function subirFirmados(req, res, next) {
  const { token } = req.body;
  try {
    const [rows] = await db.raw("SELECT * FROM usuarios WHERE token_firma = ?", [token]);
    const usuario = rows[0];
    if (!usuario) return res.status(404).json({ status: "error", message: "Enlace de firma inválido o expirado" });

    if (!req.files?.length)
      return res.status(400).json({ status: "error", message: "No se recibieron archivos." });

    const folderName = usuario.carpeta || `${usuario.nombres}_${usuario.apellidos}`.replace(/\s+/g, "_");

    await Promise.all(req.files.map((file) => {
      const ext  = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
      return s3Client.send(new PutObjectCommand({
        Bucket     : BUCKET_NAME,
        Key        : `${folderName}/documentos_firmados/${base}_${Date.now()}${ext}`,
        Body       : file.buffer,
        ContentType: file.mimetype,
      }));
    }));

    // Notificar admins (best-effort)
    const emails = await db("notificaciones").pluck("email");
    if (emails.length) {
      transporter.sendMail({
        from   : `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
        to     : emails.join(", "),
        subject: `✅ Firma Completada: ${usuario.nombres} ${usuario.apellidos}`,
        html   : `<p><strong>${usuario.nombres} ${usuario.apellidos}</strong> completó la firma y cargó ${req.files.length} documento(s).</p>`,
      }).catch(() => {});
    }

    res.json({ status: "ok", message: "Documentos firmados cargados exitosamente." });
  } catch (err) { next(err); }
}

module.exports = {
  solicitarSubsanar,
  validarTokenSubsanar,
  subirCorreccion,
  validarTokenFirma,
  solicitarFirmaContratos,
  subirFirmados,
};
