const express = require('express');
const router = express.Router();
const db = require('../databases/db'); // Tu conexión a la BD

// ============================================================
// OBTENER PERMISOS DE UN USUARIO ESPECÍFICO
// ============================================================
router.get('/permisos/:id', async (req, res) => {
    try {
        const sql = "SELECT seccion, permitido FROM permisos_usuarios WHERE usuario_id = ?";
        db.query(sql, [req.params.id], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });

            // Convertimos el array de la BD en un objeto para Vue
            // Ejemplo: { tarjeta_contratacion: true, editar_salario: false }
            const mapa = {};
            results.forEach(row => {
                mapa[row.seccion] = row.permitido === 1;
            });
            res.json(mapa);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// GUARDAR O ACTUALIZAR PERMISOS
// ============================================================
router.post('/permisos', async (req, res) => {
    const { usuario_id, permisos } = req.body;

    if (!usuario_id) return res.status(400).json({ error: "Falta usuario_id" });

    try {
        // Creamos las promesas para insertar/actualizar cada sección
        const queries = Object.entries(permisos).map(([seccion, permitido]) => {
            return new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO permisos_usuarios (usuario_id, seccion, permitido) 
                    VALUES (?, ?, ?) 
                    ON DUPLICATE KEY UPDATE permitido = VALUES(permitido)
                `;
                db.query(sql, [usuario_id, seccion, permitido ? 1 : 0], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        await Promise.all(queries);
        res.json({ status: "ok", message: "Permisos actualizados" });

    } catch (error) {
        console.error("Error guardando permisos:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;