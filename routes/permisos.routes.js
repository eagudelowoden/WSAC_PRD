const express = require("express");
const router = express.Router();
const db = require("../databases/db");
const {
  verificarAuth,
  verificarSuperAdmin,
  registrarActividad,
} = require("../middlewares/auth");

// Obtener permisos de un usuario
router.get("/:id", verificarAuth, (req, res) => {
  const sql =
    "SELECT seccion, puede_editar FROM permisos_edicion WHERE usuario_id = ?";
  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const mapaPermisos = results.reduce((acc, p) => {
      acc[p.seccion] = Number(p.puede_editar) === 1;
      return acc;
    }, {});
    res.json(mapaPermisos);
  });
});

// Guardar o actualizar permisos
router.post(
  "/",
  verificarSuperAdmin,
  registrarActividad("Actualizar permisos"),
  (req, res) => {
    const { usuario_id, permisos } = req.body;
    if (!usuario_id) return res.status(400).json({ error: "Falta id" });

    const promesas = Object.entries(permisos).map(([seccion, permitido]) => {
      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO permisos_edicion (usuario_id, seccion, puede_editar) 
          VALUES (?, ?, ?) 
          ON DUPLICATE KEY UPDATE puede_editar = VALUES(puede_editar)
        `;
        db.query(sql, [usuario_id, seccion, permitido ? 1 : 0], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    Promise.all(promesas)
      .then(() => res.json({ status: "ok", message: "Permisos actualizados" }))
      .catch((err) => res.status(500).json({ error: err.message }));
  },
);

module.exports = router;
