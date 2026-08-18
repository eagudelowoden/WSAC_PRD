/**
 * services/securityLogger.js
 * Detección heurística de payloads tipo SQLi y registro de eventos
 * de seguridad (login fallido, bloqueo por rate limit, etc.) en la
 * tabla logs_seguridad. Pensado para el flujo de /api/login, que
 * ocurre ANTES de tener req.user (no puede reusar registrarActividad).
 */
const db = require("../databases/knex");

// Heurísticas comunes de inyección SQL. No son un WAF real, solo una
// señal de alerta para revisar el panorama de intentos sospechosos.
const SQLI_PATTERNS = [
  /(\bor\b|\band\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i, // OR 1=1 / AND 1=1
  /union(\s+all)?\s+select/i,
  /select\s+.+\s+from\s+/i,
  /insert\s+into/i,
  /drop\s+table/i,
  /update\s+\w+\s+set/i,
  /--|\/\*|\*\//, // comentarios SQL
  /;\s*(drop|delete|update|insert)/i,
  /xp_cmdshell/i,
  /'\s*or\s*'?1'?\s*=\s*'?1/i,
  /sleep\s*\(\s*\d+\s*\)/i,
  /benchmark\s*\(/i,
];

function detectarSqlInjection(valor) {
  if (!valor || typeof valor !== "string") return false;
  return SQLI_PATTERNS.some((re) => re.test(valor));
}

async function registrarEventoSeguridad({
  evento,
  usuarioIntentado,
  ip,
  userAgent,
  motivo,
  payloadSospechoso,
}) {
  try {
    await db("logs_seguridad").insert({
      evento,
      usuario_intentado: usuarioIntentado ? String(usuarioIntentado).slice(0, 100) : null,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
      motivo: motivo || null,
      sospechoso_sqli: payloadSospechoso ? 1 : 0,
      payload_sospechoso: payloadSospechoso ? String(payloadSospechoso).slice(0, 500) : null,
    });
  } catch (err) {
    console.error("❌ LOG seguridad fallido:", err.message);
  }
}

module.exports = { detectarSqlInjection, registrarEventoSeguridad };
