const express = require("express");
const router  = express.Router();
const db      = require("../databases/knex");
const { verificarAuth, verificarSuperAdmin, registrarActividad } = require("../middlewares/auth");

// Obtener permisos de un usuario
router.get("/:id", verificarAuth, async (req, res, next) => {
  try {
    const rows = await db("permisos_edicion")
      .where({ usuario_id: req.params.id })
      .select("seccion", db.raw("CAST(puede_editar AS UNSIGNED) AS puede_editar"));

    const mapaPermisos = rows.reduce((acc, p) => {
      const val    = p.puede_editar;
      acc[p.seccion] = val === 1 || val === true || val === "1";
      return acc;
    }, {});

    res.json(mapaPermisos);
  } catch (err) { next(err); }
});

// Guardar o actualizar permisos
router.post("/", verificarSuperAdmin, registrarActividad("Actualizar permisos"), async (req, res, next) => {
  const { usuario_id, permisos } = req.body;
  if (!usuario_id) return res.status(400).json({ error: "Falta id" });

  try {
    await Promise.all(
      Object.entries(permisos).map(([seccion, permitido]) =>
        db.raw(
          "INSERT INTO permisos_edicion (usuario_id, seccion, puede_editar) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE puede_editar = VALUES(puede_editar)",
          [usuario_id, seccion, permitido ? 1 : 0],
        ),
      ),
    );
    res.json({ status: "ok", message: "Permisos actualizados" });
  } catch (err) { next(err); }
});

module.exports = router;
