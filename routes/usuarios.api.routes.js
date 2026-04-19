const express = require("express");
const router = express.Router();
const db = require("../databases/db");
const path = require("path");
const fs = require("fs");
const {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const { s3Client, BUCKET_NAME } = require("../services/s3Config");
const { registrarActividad } = require("../middlewares/auth");

const RUTA_SEGMENTOS = process.env.SEGMENTOS;
const fsPromises = require("fs").promises;

// ⚠️ RUTAS ESPECÍFICAS SIEMPRE ANTES QUE /:id

// Sesión actual
router.get("/session/actual", (req, res) => {
  if (req.session && req.session.usuario)
    return res.json({ status: "ok", usuario: req.session.usuario });
  res.status(401).json({ status: "error", message: "No logueado" });
});

// Listar segmentos
router.get("/segmentos", (req, res) => {
  try {
    console.log("📂 Leyendo segmentos desde:", RUTA_SEGMENTOS);
    if (!fs.existsSync(RUTA_SEGMENTOS)) {
      console.log("❌ Ruta no existe:", RUTA_SEGMENTOS);
      return res.json([]);
    }
    const segmentos = fs
      .readdirSync(RUTA_SEGMENTOS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    console.log("✅ Segmentos encontrados:", segmentos);
    res.json(segmentos);
  } catch (error) {
    console.error("Error leyendo segmentos:", error);
    res.status(500).json({ error: "Error leyendo carpeta de segmentos" });
  }
});

// Listar cargos por segmento
router.get("/cargos-por-segmento/:segmento", async (req, res) => {
  try {
    const rutaCompleta = path.join(RUTA_SEGMENTOS, req.params.segmento);
    const archivos = await fsPromises.readdir(rutaCompleta);
    const filtrados = archivos.filter(
      (f) =>
        f.toLowerCase().endsWith(".pdf") || f.toLowerCase().endsWith(".docx"),
    );
    res.json(filtrados);
  } catch (error) {
    if (error.code === "ENOENT") return res.json([]);
    res.status(500).json({ error: "Error leyendo cargos" });
  }
});

// Listar todos los usuarios
router.get("/", (req, res) => {
  db.query("CALL sp_ListarUsuariosResumen()", (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result[0]);
  });
});

// ⚠️ /:id SIEMPRE AL FINAL
// Obtener usuario por ID
router.get("/usuario/:id", (req, res) => {
  db.query("CALL sp_ObtenerUsuarioPorId(?)", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    const filas = result[0];
    if (!filas || filas.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(filas[0]);
  });
});

// Actualizar usuario
router.put(
  "/usuario/:id",
  registrarActividad("Actualizar usuario"),
  async (req, res) => {
    const id = req.params.id;
    const data = req.body;

    try {
      if (data.segmento_contrato && data.descripcion_cargo) {
        const [userRows] = await db
          .promise()
          .query(
            "SELECT carpeta, nombres, apellidos FROM usuarios WHERE id = ?",
            [id],
          );

        if (userRows.length > 0) {
          let userFolder =
            userRows[0].carpeta ||
            `${userRows[0].nombres} ${userRows[0].apellidos}`.trim();

          const rutaLocalPDF = path.join(
            RUTA_SEGMENTOS,
            data.segmento_contrato,
            data.descripcion_cargo,
          );

          if (fs.existsSync(rutaLocalPDF)) {
            const fileContent = fs.readFileSync(rutaLocalPDF);
            const s3Key = `${userFolder}/CARGO_${data.descripcion_cargo}`;
            await s3Client.send(
              new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: fileContent,
                ContentType: "application/pdf",
              }),
            );
          }
        }
      }

      const sql = `
      UPDATE usuarios SET 
        nombres=?, apellidos=?, documento=?, telefono=?, direccion=?, correo=?,
        fechaNacimiento=?, eps=?, arl=?, afp=?, ccf=?, ciudad=?, salario=?, cargo=?,
        afiliaciones_familiares=?, observaciones=?, segmento_contrato=?, descripcion_cargo=?,
        aprobacion=?, otro_si=?, tipo_contrato=?, curso=?, correoAprendizaje=?,
        institucion=?, nitinstitucion=?, centroSena=?, fechaterminacion=?, fecha_suscripcion=?
      WHERE id=?
    `;

      const valores = [
        data.nombres,
        data.apellidos,
        data.documento,
        data.telefono,
        data.direccion,
        data.correo,
        data.fechaNacimiento,
        data.epsNombre || data.eps,
        data.arlNombre || data.arl,
        data.afpNombre || data.afp,
        data.ccfNombre || data.ccf,
        data.ciudad,
        data.salario,
        data.cargo,
        data.afiliaciones_familiares,
        data.observaciones,
        data.segmento_contrato,
        data.descripcion_cargo,
        data.aprobacion,
        data.otroSi,
        data.tipo_contrato,
        data.curso,
        data.correoAprendizaje,
        data.institucion,
        data.nitinstitucion,
        data.centroSena,
        data.fechaterminacion || null,
        data.fechaSuscripcion || null,
        id,
      ];

      db.query(sql, valores, (err) => {
        if (err)
          return res
            .status(500)
            .json({ status: "error", message: err.message });
        res.json({ status: "ok", message: "Datos actualizados" });
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Error interno" });
    }
  },
);

// Eliminar usuario y archivos S3
router.delete(
  "/usuario/:id",
  registrarActividad("Eliminar usuario"),
  (req, res) => {
    db.query(
      "SELECT carpeta FROM usuarios WHERE id = ?",
      [req.params.id],
      async (err, results) => {
        if (err || results.length === 0)
          return res
            .status(404)
            .json({ status: "error", message: "Usuario no encontrado" });

        const folderName = results[0].carpeta;

        if (folderName) {
          try {
            const listResp = await s3Client.send(
              new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                Prefix: folderName + "/",
              }),
            );
            if (listResp.Contents?.length > 0) {
              await s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: BUCKET_NAME,
                  Delete: {
                    Objects: listResp.Contents.map((i) => ({ Key: i.Key })),
                  },
                }),
              );
            }
          } catch (e) {
            console.error("Error borrando S3:", e);
          }
        }

        db.query(
          "DELETE FROM usuarios WHERE id = ?",
          [req.params.id],
          (errDel) => {
            if (errDel) return res.status(500).json({ status: "error" });
            res.json({
              status: "ok",
              message: "Usuario y archivos eliminados",
            });
          },
        );
      },
    );
  },
);

module.exports = router;
