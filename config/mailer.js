const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host      : process.env.OUTLOOK_HOST,
  port      : parseInt(process.env.OUTLOOK_PORT),
  secure    : process.env.OUTLOOK_SECURE === "true",
  requireTLS: process.env.OUTLOOK_REQUIRE_TLS === "true",
  auth      : { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

transporter.verify((error) => {
  if (error) console.error("❌ Error conectando al correo:", error.message);
  else       (global.log || console.log)("✅ Servidor de correo listo.");
});

module.exports = transporter;
