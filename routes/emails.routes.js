const express = require("express");
const router  = express.Router();
const db      = require("../databases/knex");

// ── EMAILS DE CONTRATACIÓN ───────────────────────────────────────
router.get("/emails", async (req, res, next) => {
  try {
    const rows = await db("notificaciones").select("email");
    res.json(rows.map((r) => r.email));
  } catch (err) { next(err); }
});

router.post("/emails", async (req, res, next) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ status: "error", message: "Falta el email" });
  try {
    await db("notificaciones").insert({ email });
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

router.delete("/emails", async (req, res, next) => {
  try {
    await db("notificaciones").where({ email: req.body.email }).delete();
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

// ── EMAILS DE NÓMINA ─────────────────────────────────────────────
router.get("/emails-nomina", async (req, res, next) => {
  try {
    const rows = await db("notificaciones_nomina").select("email");
    res.json(rows.map((r) => r.email));
  } catch (err) { next(err); }
});

router.post("/emails-nomina", async (req, res, next) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ status: "error", message: "Falta el email" });
  try {
    await db("notificaciones_nomina").insert({ email });
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

router.delete("/emails-nomina", async (req, res, next) => {
  try {
    await db("notificaciones_nomina").where({ email: req.body.email }).delete();
    res.json({ status: "ok" });
  } catch (err) { next(err); }
});

module.exports = router;
