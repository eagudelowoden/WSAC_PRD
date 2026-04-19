const express = require("express");
const router = express.Router();
const db = require("../databases/db");

// ── EMAILS DE CONTRATACIÓN ──────────────────────────────────────

router.get("/emails", (req, res) => {
  db.query("SELECT email FROM notificaciones", (err, results) => {
    if (err)
      return res.status(500).json({ status: "error", message: err.message });
    res.json(results.map((r) => r.email));
  });
});

router.post("/emails", (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ status: "error", message: "Falta el email" });

  db.query("INSERT INTO notificaciones (email) VALUES (?)", [email], (err) => {
    if (err)
      return res.status(500).json({ status: "error", message: err.message });
    res.json({ status: "ok" });
  });
});

router.delete("/emails", (req, res) => {
  const { email } = req.body;
  db.query("DELETE FROM notificaciones WHERE email = ?", [email], (err) => {
    if (err)
      return res.status(500).json({ status: "error", message: err.message });
    res.json({ status: "ok" });
  });
});

// ── EMAILS DE NÓMINA ────────────────────────────────────────────

router.get("/emails-nomina", (req, res) => {
  db.query("SELECT email FROM notificaciones_nomina", (err, results) => {
    if (err)
      return res.status(500).json({ status: "error", message: err.message });
    res.json(results.map((r) => r.email));
  });
});

router.post("/emails-nomina", (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ status: "error", message: "Falta el email" });

  db.query(
    "INSERT INTO notificaciones_nomina (email) VALUES (?)",
    [email],
    (err) => {
      if (err)
        return res.status(500).json({ status: "error", message: err.message });
      res.json({ status: "ok" });
    },
  );
});

router.delete("/emails-nomina", (req, res) => {
  const { email } = req.body;
  db.query(
    "DELETE FROM notificaciones_nomina WHERE email = ?",
    [email],
    (err) => {
      if (err)
        return res.status(500).json({ status: "error", message: err.message });
      res.json({ status: "ok" });
    },
  );
});

module.exports = router;
