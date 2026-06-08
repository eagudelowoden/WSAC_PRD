const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../databases/db");
const {
  verificarSuperAdmin,
  registrarActividad,
} = require("../middlewares/auth");

// Asegurar columnas cedula y fecha_nacimiento en usuariosSys (compatible MySQL 5.7+)
db.query("ALTER TABLE usuariosSys ADD COLUMN cedula VARCHAR(20) DEFAULT NULL", () => {});
db.query("ALTER TABLE usuariosSys ADD COLUMN fecha_nacimiento DATE DEFAULT NULL", () => {});

// Listar usuarios
router.get("/", verificarSuperAdmin, (req, res) => {
  db.query(
    "SELECT id, nombre, usuario, rol, cedula, DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento FROM usuariosSys",
    (err, results) => {
      if (err) return res.status(500).json([]);
      res.json(results);
    },
  );
});

// Crear usuario
router.post(
  "/",
  verificarSuperAdmin,
  registrarActividad("Crear usuario"),
  (req, res) => {
    const { nombre, usuario, password, rol, cedula, fecha_nacimiento } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return res.status(500).json({ error: "Error encriptando" });
      db.query(
        "INSERT INTO usuariosSys (nombre, usuario, password, rol, cedula, fecha_nacimiento) VALUES (?, ?, ?, ?, ?, ?)",
        [nombre, usuario, hash, rol, cedula || null, fecha_nacimiento || null],
        (err, result) => {
          if (err) {
            if (err.code === "ER_DUP_ENTRY")
              return res.json({
                status: "error",
                message: "Usuario ya existe",
              });
            return res.json({ status: "error", message: "Error BD" });
          }
          res.json({ status: "ok", id: result.insertId });
        },
      );
    });
  },
);

// Eliminar usuario
router.delete(
  "/:id",
  verificarSuperAdmin,
  registrarActividad("Eliminar usuario"),
  (req, res) => {
    db.query("DELETE FROM usuariosSys WHERE id = ?", [req.params.id], (err) =>
      res.json({ status: err ? "error" : "ok" }),
    );
  },
);

// ── Emails de notificaciones generales ──────────────────────────

router.get("/emails", verificarSuperAdmin, (req, res) => {
  db.query("SELECT email FROM notificaciones", (err, results) => {
    if (err) return res.json([]);
    res.json(results.map((r) => r.email));
  });
});

router.post(
  "/emails",
  verificarSuperAdmin,
  registrarActividad("Agregar correo notificaciones"),
  (req, res) => {
    db.query(
      "INSERT INTO notificaciones (email) VALUES (?)",
      [req.body.email],
      (err) => res.json({ status: err ? "error" : "ok" }),
    );
  },
);

router.delete(
  "/emails",
  verificarSuperAdmin,
  registrarActividad("Eliminar correo notificaciones"),
  (req, res) => {
    db.query(
      "DELETE FROM notificaciones WHERE email = ?",
      [req.body.email],
      (err) => res.json({ status: "ok" }),
    );
  },
);

// ── Emails de nómina ─────────────────────────────────────────────

router.get("/emails-nomina", verificarSuperAdmin, (req, res) => {
  db.query("SELECT email FROM notificaciones_nomina", (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results.map((r) => r.email));
  });
});

router.post(
  "/emails-nomina",
  verificarSuperAdmin,
  registrarActividad("Agregar correo nómina"),
  (req, res) => {
    const { email } = req.body;
    db.query(
      "INSERT INTO notificaciones_nomina (email) VALUES (?)",
      [email],
      (err) => {
        if (err)
          return res
            .status(500)
            .json({
              status: "error",
              message: "El correo ya existe o hubo un error.",
            });
        res.json({ status: "ok" });
      },
    );
  },
);

router.delete(
  "/emails-nomina",
  verificarSuperAdmin,
  registrarActividad("Eliminar correo nómina"),
  (req, res) => {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ status: "error", message: "Email requerido" });

    db.query(
      "DELETE FROM notificaciones_nomina WHERE email = ?",
      [email],
      (err) => {
        if (err)
          return res
            .status(500)
            .json({ status: "error", message: "Error al eliminar" });
        res.json({ status: "ok", message: "Correo eliminado correctamente" });
      },
    );
  },
);

module.exports = router;
