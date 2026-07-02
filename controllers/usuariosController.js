const db         = require("../databases/knex");
const path       = require("path");
const fs         = require("fs");
const fsPromises = require("fs").promises;
const {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const { s3Client, BUCKET_NAME } = require("../services/s3Config");

const RUTA_SEGMENTOS = process.env.SEGMENTOS;

function sesionActual(req, res) {
  res.json({ status: "ok", usuario: req.user });
}

function listarSegmentos(req, res) {
  try {
    if (!RUTA_SEGMENTOS || !fs.existsSync(RUTA_SEGMENTOS))
      return res.json([]);

    const segmentos = fs
      .readdirSync(RUTA_SEGMENTOS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    res.json(segmentos);
  } catch {
    res.status(500).json({ error: "Error leyendo carpeta de segmentos" });
  }
}

async function cargosPorSegmento(req, res) {
  try {
    const rutaCompleta = path.join(RUTA_SEGMENTOS, req.params.segmento);
    const archivos     = await fsPromises.readdir(rutaCompleta);
    res.json(archivos.filter((f) => /\.(pdf|docx)$/i.test(f)));
  } catch (error) {
    if (error.code === "ENOENT") return res.json([]);
    res.status(500).json({ error: "Error leyendo cargos" });
  }
}

async function listarColaboradores(req, res, next) {
  try {
    const rows = await db("usuarios").select(
      "id", "nombres", "apellidos", "documento", "telefono", "correo",
      "cargo", "ciudad", "salario", "eps", "arl", "afp", "ccf",
      "aprobacion", "segmento_contrato", "descripcion_cargo",
      "tipo_contrato", "carpeta", "observaciones",
      db.raw("DATE_FORMAT(fechaNacimiento, '%Y-%m-%d') AS fechaNacimiento"),
      db.raw("DATE_FORMAT(fechaterminacion, '%Y-%m-%d') AS fechaterminacion"),
      db.raw("DATE_FORMAT(fecha_suscripcion, '%Y-%m-%d') AS fecha_suscripcion"),
    ).where({ activo: 1 }).orderBy("id", "desc");
    res.json(rows);
  } catch (err) { next(err); }
}

async function obtenerColaborador(req, res, next) {
  try {
    const row = await db("usuarios")
      .where({ id: req.params.id })
      .select(
        "id", "nombres", "apellidos", "documento", "telefono", "correo", "direccion",
        "cargo", "ciudad", "salario", "eps", "arl", "afp", "ccf",
        "aprobacion", "otro_si", "segmento_contrato", "descripcion_cargo",
        "tipo_contrato", "carpeta", "observaciones", "afiliaciones_familiares",
        "curso", "correoAprendizaje", "institucion", "nitinstitucion", "centroSena",
        db.raw("DATE_FORMAT(fechaNacimiento, '%Y-%m-%d') AS fechaNacimiento"),
        db.raw("DATE_FORMAT(fechaterminacion, '%Y-%m-%d') AS fechaterminacion"),
        db.raw("DATE_FORMAT(fecha_suscripcion, '%Y-%m-%d') AS fecha_suscripcion"),
      )
      .first();
    if (!row) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(row);
  } catch (err) { next(err); }
}

async function actualizarColaborador(req, res, next) {
  const id   = req.params.id;
  const data = req.body;

  try {
    // Vincular descripción de cargo a S3 si aplica
    if (data.segmento_contrato && data.descripcion_cargo) {
      const [userRows] = await db.raw(
        "SELECT carpeta, nombres, apellidos FROM usuarios WHERE id = ?", [id],
      );
      if (userRows.length > 0) {
        const userFolder = userRows[0].carpeta || `${userRows[0].nombres} ${userRows[0].apellidos}`.trim();
        const rutaLocalPDF = path.join(RUTA_SEGMENTOS, data.segmento_contrato, data.descripcion_cargo);

        if (fs.existsSync(rutaLocalPDF)) {
          await s3Client.send(new PutObjectCommand({
            Bucket     : BUCKET_NAME,
            Key        : `${userFolder}/CARGO_${data.descripcion_cargo}`,
            Body       : fs.readFileSync(rutaLocalPDF),
            ContentType: "application/pdf",
          }));
        }
      }
    }

    await db.raw(`
      UPDATE usuarios SET
        nombres=?, apellidos=?, documento=?, telefono=?, direccion=?, correo=?,
        fechaNacimiento=?, eps=?, arl=?, afp=?, ccf=?, ciudad=?, salario=?, cargo=?,
        afiliaciones_familiares=?, observaciones=?, segmento_contrato=?, descripcion_cargo=?,
        aprobacion=?, otro_si=?, tipo_contrato=?, curso=?, correoAprendizaje=?,
        institucion=?, nitinstitucion=?, centroSena=?, fechaterminacion=?, fecha_suscripcion=?
      WHERE id=?
    `, [
      data.nombres, data.apellidos, data.documento, data.telefono, data.direccion, data.correo,
      data.fechaNacimiento, data.epsNombre || data.eps, data.arlNombre || data.arl,
      data.afpNombre || data.afp, data.ccfNombre || data.ccf, data.ciudad, data.salario, data.cargo,
      data.afiliaciones_familiares, data.observaciones, data.segmento_contrato, data.descripcion_cargo,
      data.aprobacion, data.otroSi, data.tipo_contrato, data.curso, data.correoAprendizaje,
      data.institucion, data.nitinstitucion, data.centroSena,
      data.fechaterminacion || null, data.fechaSuscripcion || null, id,
    ]);

    res.json({ status: "ok", message: "Datos actualizados" });
  } catch (err) { next(err); }
}

async function cambiarEstadoColaborador(req, res, next) {
  const { aprobacion, observaciones } = req.body;
  const ESTADOS_VALIDOS = [0, 1, 2, 3, 4];
  if (!ESTADOS_VALIDOS.includes(Number(aprobacion)))
    return res.status(400).json({ status: "error", message: "Estado inválido." });

  try {
    const updates = { aprobacion: Number(aprobacion) };
    if (observaciones !== undefined) updates.observaciones = String(observaciones).substring(0, 1000);

    await db("usuarios").where({ id: req.params.id }).update(updates);
    res.json({ status: "ok" });
  } catch (err) { next(err); }
}

async function eliminarColaborador(req, res, next) {
  try {
    const [rows] = await db.raw("SELECT carpeta FROM usuarios WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ status: "error", message: "Usuario no encontrado" });

    const folderName = rows[0].carpeta;
    if (folderName) {
      const listResp = await s3Client.send(
        new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: folderName + "/" }),
      );
      if (listResp.Contents?.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: listResp.Contents.map((i) => ({ Key: i.Key })) },
        }));
      }
    }

    await db("usuarios").where({ id: req.params.id }).delete();
    res.json({ status: "ok", message: "Usuario y archivos eliminados" });
  } catch (err) { next(err); }
}

module.exports = {
  sesionActual,
  listarSegmentos,
  cargosPorSegmento,
  listarColaboradores,
  obtenerColaborador,
  actualizarColaborador,
  cambiarEstadoColaborador,
  eliminarColaborador,
};
