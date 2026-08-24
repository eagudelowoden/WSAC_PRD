const express = require("express");
const router  = express.Router();
const db      = require("../databases/knex");
const { verificarAuth, verificarSuperAdmin, registrarActividad, obtenerModulosEfectivos } = require("../middlewares/auth");

// Permisos de edición finos: no dependen del rol, false si no hay fila explícita.
const PERMISOS_EDICION_FINOS = ["tarjeta_contratacion", "editar_salario", "editar_ciudad"];

// Obtener permisos EFECTIVOS de un usuario: mezcla el default de su rol
// (mismo que aplica verificarModulo) con cualquier override explícito en BD.
// Así el panel de superadmin siempre muestra lo que el usuario realmente
// tiene, en vez de "todo apagado" para cuentas sin filas guardadas aún.
router.get("/:id", verificarAuth, async (req, res, next) => {
  try {
    const [userRows] = await db.raw("SELECT rol FROM usuariosSys WHERE id = ?", [req.params.id]);
    const rol = userRows[0]?.rol;

    const mapaPermisos = await obtenerModulosEfectivos(req.params.id, rol);

    const rows = await db("permisos_edicion")
      .where({ usuario_id: req.params.id })
      .whereIn("seccion", PERMISOS_EDICION_FINOS)
      .select("seccion", db.raw("CAST(puede_editar AS UNSIGNED) AS puede_editar"));

    PERMISOS_EDICION_FINOS.forEach((k) => { mapaPermisos[k] = false; });
    rows.forEach((p) => { mapaPermisos[p.seccion] = p.puede_editar === 1; });

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
