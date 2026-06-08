const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcrypt");
const db      = require("../databases/knex");
const { verificarSuperAdmin, registrarActividad } = require("../middlewares/auth");

// Asegurar columnas cedula y fecha_nacimiento (compatible MySQL 5.7+, ignorar si ya existen)
db.raw("ALTER TABLE usuariosSys ADD COLUMN cedula VARCHAR(20) DEFAULT NULL").catch(() => {});
db.raw("ALTER TABLE usuariosSys ADD COLUMN fecha_nacimiento DATE DEFAULT NULL").catch(() => {});

// ── Listar usuarios del sistema ──────────────────────────────────
router.get("/", verificarSuperAdmin, async (req, res, next) => {
  try {
    const rows = await db("usuariosSys").select(
      "id", "nombre", "usuario", "rol", "cedula",
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

// ── Eliminar usuario ─────────────────────────────────────────────
router.delete("/:id", verificarSuperAdmin, registrarActividad("Eliminar usuario"), async (req, res, next) => {
  try {
    await db("usuariosSys").where({ id: req.params.id }).delete();
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
