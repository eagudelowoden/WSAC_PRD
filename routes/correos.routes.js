const express    = require("express");
const router     = express.Router();
const axios      = require("axios");
const db         = require("../databases/knex");
const { registrarActividad } = require("../middlewares/auth");
const nodemailer = require("nodemailer");

const correoOutlook = nodemailer.createTransport({
  host      : process.env.OUTLOOK_HOST,
  port      : parseInt(process.env.OUTLOOK_PORT),
  secure    : process.env.OUTLOOK_SECURE === "true",
  requireTLS: process.env.OUTLOOK_REQUIRE_TLS === "true",
  auth      : { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

// Enviar historial de contratos al colaborador
router.post("/enviar-historial-contratos", registrarActividad("Enviar historial contratos"), async (req, res, next) => {
  const { usuario, archivos } = req.body;
  if (!archivos?.length)
    return res.status(400).json({ status: "error", message: "No hay archivos seleccionados." });

  try {
    const attachments = await Promise.all(
      archivos.map(async (file) => {
        const response = await axios.get(file.url, { responseType: "arraybuffer" });
        return { filename: file.name, content: Buffer.from(response.data) };
      }),
    );

    await correoOutlook.sendMail({
      from   : `"WSAC Contratación" <${process.env.OUTLOOK_USER}>`,
      to     : usuario.correo,
      subject: `📝 Documentos Disponibles: ${usuario.nombres}`,
      html   : `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e1e4e8;border-radius:15px;overflow:hidden;">
          <div style="background-color:#1e3a8a;padding:20px;text-align:center;color:white;">
            <h2 style="margin:0;">WSAC Info</h2>
          </div>
          <div style="padding:30px;color:#333;">
            <h3>Hola, ${usuario.nombres}</h3>
            <p>Adjuntos encontrarás <b>${archivos.length} archivo(s)</b> de tu proceso de contratación.</p>
          </div>
        </div>`,
      attachments,
    });
    res.json({ status: "ok", message: "Enviado con éxito" });
  } catch (err) { next(err); }
});

// Notificar aprobación al colaborador
router.post("/notificar-aprobacion", registrarActividad("Notificar aprobación"), async (req, res, next) => {
  const { id } = req.body;
  try {
    const [users] = await db.raw("SELECT nombres, correo, cargo FROM usuarios WHERE id = ?", [id]);
    if (!users.length) return res.status(404).json({ status: "error", message: "Usuario no encontrado" });

    const u = users[0];
    await correoOutlook.sendMail({
      from   : `"WSAC Notificaciones" <${process.env.OUTLOOK_USER}>`,
      to     : u.correo,
      subject: "Documentos Aprobados - WSAC INFO",
      html   : `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;">
          <div style="background:#F5B027;padding:20px;text-align:center;">
            <h1 style="color:white;margin:0;">WSAC INFO</h1>
          </div>
          <div style="padding:30px;">
            <h2>¡Felicidades, ${u.nombres}!</h2>
            <p>Tus documentos han sido <strong>aprobados</strong>. Tu cargo asignado es: <b>${u.cargo || "Asignado"}</b>.</p>
          </div>
        </div>`,
    });
    res.json({ status: "ok", message: "Notificación de aprobación enviada" });
  } catch (err) { next(err); }
});

// Notificar a nómina
router.post("/notificar-nomina", registrarActividad("Notificar nómina"), async (req, res, next) => {
  const { id } = req.body;
  try {
    const [users] = await db.raw(
      "SELECT nombres, apellidos, cargo, salario, segmento_contrato, ciudad FROM usuarios WHERE id = ?", [id],
    );
    if (!users.length) return res.status(500).json({ status: "error", message: "Usuario no encontrado" });

    const u     = users[0];
    const emails = await db("notificaciones_nomina").pluck("email");
    if (!emails.length) return res.status(404).json({ status: "error", message: "Sin correos de nómina" });

    await correoOutlook.sendMail({
      from   : `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
      to     : emails,
      subject: `Notificación WSAC: Contrato Aprobado - ${u.nombres}`,
      html   : `
        <div style="padding:20px;font-family:'Segoe UI',Arial,sans-serif;">
          <h2>Aviso de Nuevo Contrato</h2>
          <p><strong>Colaborador:</strong> ${u.nombres} ${u.apellidos}</p>
          <p><strong>Cargo:</strong> ${u.cargo}</p>
          <p><strong>Salario:</strong> $${u.salario}</p>
          <p><strong>Segmento:</strong> ${u.segmento_contrato}</p>
          <p><strong>Ciudad:</strong> ${u.ciudad}</p>
        </div>`,
    });
    res.json({ status: "ok", message: "Notificación enviada a nómina" });
  } catch (err) { next(err); }
});

// Notificar nuevo registro al equipo de selección
router.post("/notificarRegistro", registrarActividad("Notificar nuevo registro"), async (req, res, next) => {
  const { id } = req.body;
  try {
    const [users] = await db.raw("SELECT nombres, apellidos FROM usuarios WHERE id = ?", [id]);
    if (!users.length) return res.status(500).json({ status: "error", message: "Usuario no encontrado" });

    const u      = users[0];
    const emails  = await db("notificaciones").pluck("email");
    if (!emails.length) return res.status(404).json({ status: "error", message: "Sin correos configurados" });

    await correoOutlook.sendMail({
      from   : `"WSAC Sistema" <${process.env.OUTLOOK_USER}>`,
      to     : emails,
      subject: `Notificacion: Nuevo Registro - ${u.nombres}`,
      html   : `
        <div style="padding:20px;font-family:'Segoe UI',Arial,sans-serif;">
          <h2>Nuevo Colaborador Registrado</h2>
          <p><strong>Colaborador:</strong> ${u.nombres} ${u.apellidos}</p>
          <p>Por favor, validar la información en el panel administrativo.</p>
        </div>`,
    });
    res.json({ status: "ok", message: "Notificación enviada" });
  } catch (err) { next(err); }
});

module.exports = router;
