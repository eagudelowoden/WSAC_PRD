const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcrypt");
const db      = require("../databases/knex");
const { verificarSuperAdmin, registrarActividad } = require("../middlewares/auth");

// Asegurar columnas cedula y fecha_nacimiento (compatible MySQL 5.7+, ignorar si ya existen)
db.raw("ALTER TABLE usuariosSys ADD COLUMN cedula VARCHAR(20) DEFAULT NULL").catch(() => {});
db.raw("ALTER TABLE usuariosSys ADD COLUMN fecha_nacimiento DATE DEFAULT NULL").catch(() => {});
// Estado de la cuenta: 1 = activa, 0 = desactivada (no puede iniciar sesión)
db.raw("ALTER TABLE usuariosSys ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1").catch(() => {});

// ── Listar usuarios del sistema ──────────────────────────────────
// Se devuelven también los desactivados (con activo=0) para poder reactivarlos.
router.get("/", verificarSuperAdmin, async (req, res, next) => {
  try {
    const rows = await db("usuariosSys").select(
      "id", "nombre", "usuario", "rol", "cedula", "activo",
      db.raw("DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento"),
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Crear usuario ────────────────────────────────────────────────
router.post("/", verificarSuperAdmin, registrarActividad("Crear usuario"), async (req, res, next) => {
  const { nombre, usuario, password, rol, cedula, fecha_nacimiento } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const [id] = await db("usuariosSys").insert({
      nombre, usuario, password: hash, rol,
      cedula         : cedula          || null,
      fecha_nacimiento: fecha_nacimiento || null,
    });
    res.json({ status: "ok", id });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.json({ status: "error", message: "Usuario ya existe" });
    next(err);
  }
});

// ── Desactivar / reactivar usuario ───────────────────────────────
// NO se borra el registro: se marca activo=0 para que no pueda iniciar sesión.
// Body opcional { activo: 1 } para reactivar.
router.patch("/:id/activo", verificarSuperAdmin, registrarActividad("Cambiar estado usuario"), async (req, res, next) => {
  try {
    const activo = Number(req.body?.activo) === 1 ? 1 : 0;

    // Evitar que el superadmin se desactive a sí mismo y pierda el acceso.
    if (activo === 0 && Number(req.params.id) === Number(req.user?.id)) {
      return res.status(400).json({ status: "error", message: "No puedes desactivar tu propia cuenta." });
    }

    const filas = await db("usuariosSys").where({ id: req.params.id }).update({ activo });
    if (!filas) return res.status(404).json({ status: "error", message: "Usuario no encontrado" });

    res.json({ status: "ok", activo });
  } catch (err) { next(err); }
});

// ── Cambiar contraseña de un usuario (acción de superadmin) ─────
router.patch("/:id/password", verificarSuperAdmin, registrarActividad("Cambiar contraseña usuario"), async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ status: "error", message: "La contraseña debe tener al menos 6 caracteres." });
    }

    const hash = await bcrypt.hash(password, 10);
    const filas = await db("usuariosSys").where({ id: req.params.id }).update({ password: hash });
    if (!filas) return res.status(404).json({ status: "error", message: "Usuario no encontrado" });

    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

// Compatibilidad: el antiguo DELETE ahora desactiva (nunca borra).
router.delete("/:id", verificarSuperAdmin, registrarActividad("Desactivar usuario"), async (req, res, next) => {
  try {
    if (Number(req.params.id) === Number(req.user?.id)) {
      return res.status(400).json({ status: "error", message: "No puedes desactivar tu propia cuenta." });
    }
    await db("usuariosSys").where({ id: req.params.id }).update({ activo: 0 });
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

// ── Emails de notificaciones generales ──────────────────────────
router.get("/emails", verificarSuperAdmin, async (req, res, next) => {
  try {
    const rows = await db("notificaciones").select("email");
    res.json(rows.map((r) => r.email));
  } catch (err) { next(err); }
});

router.post("/emails", verificarSuperAdmin, registrarActividad("Agregar correo notificaciones"), async (req, res, next) => {
  try {
    await db("notificaciones").insert({ email: req.body.email });
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

router.delete("/emails", verificarSuperAdmin, registrarActividad("Eliminar correo notificaciones"), async (req, res, next) => {
  try {
    await db("notificaciones").where({ email: req.body.email }).delete();
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

// ── Emails de nómina ─────────────────────────────────────────────
router.get("/emails-nomina", verificarSuperAdmin, async (req, res, next) => {
  try {
    const rows = await db("notificaciones_nomina").select("email");
    res.json(rows.map((r) => r.email));
  } catch (err) { next(err); }
});

router.post("/emails-nomina", verificarSuperAdmin, registrarActividad("Agregar correo nómina"), async (req, res, next) => {
  try {
    await db("notificaciones_nomina").insert({ email: req.body.email });
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

router.delete("/emails-nomina", verificarSuperAdmin, registrarActividad("Eliminar correo nómina"), async (req, res, next) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ status: "error", message: "Email requerido" });
  try {
    await db("notificaciones_nomina").where({ email }).delete();
    res.json({ status: "ok", message: "Correo eliminado correctamente" });
  } catch (err) { next(err); }
});

module.exports = router;
