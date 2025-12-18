const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../databases/db"); 
const nodemailer = require("nodemailer");
const crypto = require('crypto'); 
const PORT = process.env.PORT;
const RUTA_SEGMENTOS = process.env.SEGMENTOS;
const URL_BASE = process.env.URL_BASE;
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../databases/db"); 
const nodemailer = require("nodemailer");
const crypto = require('crypto');
// IMPORTAMOS LIBRERÍAS DE AWS
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const URL_BASEDEV = process.env.URL_BASEDEV;


// ==========================================
// CONFIGURACIÓN GENERAL
// ==========================================

// 1. RUTA DE CARPETAS DE SEGMENTOS (AJUSTADA CON DOBLE SLASH \\)
//const RUTA_SEGMENTOS = "C:\\Users\\Daniel\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PublicaSegmentos";

// 2. CONFIGURACIÓN MULTER
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads/tmp")),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// 3. CONFIGURACIÓN CORREO
const correoOutlook = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: "eagudelo@woden.com.co", pass: "WmsWeb2025**" }
});

// ==========================================
// RUTAS NUEVAS: SEGMENTOS Y CARGOS (PDFs)
// ==========================================

// A. LISTAR CARPETAS (SEGMENTOS)
router.get("/segmentos", (req, res) => {
    try {
        if (!fs.existsSync(RUTA_SEGMENTOS)) {
            console.error("❌ La ruta de segmentos no existe:", RUTA_SEGMENTOS);
            return res.json([]); 
        }
        
        const segmentos = fs.readdirSync(RUTA_SEGMENTOS, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
            
        res.json(segmentos);
    } catch (error) {
        console.error("Error leyendo segmentos:", error);
        res.status(500).json({ error: "Error leyendo carpeta de segmentos" });
    }
});

// B. LISTAR ARCHIVOS PDF DENTRO DE UN SEGMENTO
router.get("/cargos-por-segmento/:segmento", (req, res) => {
    try {
        const segmento = req.params.segmento;
        const rutaCompleta = path.join(RUTA_SEGMENTOS, segmento);

        if (!fs.existsSync(rutaCompleta)) {
            return res.json([]);
        }

        const archivos = fs.readdirSync(rutaCompleta)
            .filter(file => file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.docx'));
            
        res.json(archivos);
    } catch (error) {
        console.error("Error leyendo cargos:", error);
        res.status(500).json({ error: "Error leyendo cargos" });
    }
});

// ==========================================
// RUTAS EXISTENTES: USUARIOS Y GESTIÓN
// ==========================================

// 1. Listar Usuarios
router.get("/usuarios", (req, res) => {
    db.query("SELECT id, nombres, apellidos, documento, carpeta, correo FROM usuarios", (err, resultados) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(resultados);
    });
});
// Agrega esto en tu router o server.js
// Esta ruta permite al frontend preguntar quién está logueado
// Agrega esto en tus rutas de Node.js
router.get("/session/actual", (req, res) => {
    // Verificamos si hay sesión guardada (según tu login anterior)
    if (req.session && req.session.usuario) {
        res.json({ status: "ok", usuario: req.session.usuario });
    } else {
        res.status(401).json({ status: "error", message: "No logueado" });
    }
});

// ==========================================
// RUTA NUEVA: ACTUALIZAR DATOS PERSONALES
// ==========================================

router.put("/usuario/:id", (req, res) => {
    const id = req.params.id;
    const data = req.body;

    const sql = `
        UPDATE usuarios SET 
            nombres = ?, 
            apellidos = ?, 
            documento = ?, 
            telefono = ?, 
            direccion = ?, 
            correo = ?, 
            fechaNacimiento = ?, 
            eps = ?, 
            arl = ?, 
            afp = ?, 
            ccf = ?, 
            ciudad = ?,
            salario = ?,
            cargo = ?,
            afiliaciones_familiares = ?,    
            aprobacion = ?,
        WHERE id = ?
    `;

    // Mapeo de datos: El frontend envía 'epsNombre', la BD espera 'eps'
    const valores = [
        data.nombres,
        data.apellidos,
        data.documento,
        data.telefono,
        data.direccion,
        data.correo,
        data.fechaNacimiento,
        data.epsNombre, 
        data.arlNombre, 
        data.afpNombre, 
        data.ccfNombre,
        data.ciudad,
        data.salario,
        data.cargo,
        data.afiliaciones_familiares,
        id
    ];

    db.query(sql, valores, (err, result) => {
        if (err) {
            console.error("Error SQL:", err);
            return res.status(500).json({ status: 'error', message: err.message });
        }
        res.json({ status: 'ok', message: 'Datos actualizados correctamente' });
    });
});

// Ruta para eliminar usuario
router.delete("/usuario/:id", (req, res) => {
    const id = req.params.id;

    const sql = "DELETE FROM usuarios WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("Error al eliminar:", err);
            return res.status(500).json({ status: 'error', message: err.message });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });
        }

        res.json({ status: 'ok', message: 'Usuario eliminado correctamente' });
    });
});
// 3. Listar Archivos del Usuario
router.get("/archivos/:carpeta", (req, res) => {
    const folderPath = path.join(__dirname, "..", "uploads", req.params.carpeta);
    if (!fs.existsSync(folderPath)) return res.json([]);
    const files = fs.readdirSync(folderPath).map(file => ({
        name: file,
        url: `/uploads/${req.params.carpeta}/${file}`
    }));
    res.json(files);
});

// ==========================================
// RUTA POST: REGISTRO INICIAL
// ==========================================
router.post("/enviar", upload.any(), (req, res) => {
    const data = req.body;
    const safeData = {
        ...data,
        afiliacionesFamiliares: data.afiliacionesFamiliares || '',
        observaciones: data.observaciones || ''
    };

    const fullName = `${safeData.nombres} ${safeData.apellidos}`;
    const userFolder = path.join(__dirname, "..", "uploads", fullName);

    if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

    if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
            const oldPath = file.path;
            const newPath = path.join(userFolder, file.filename);
            try { fs.renameSync(oldPath, newPath); } catch (err) { console.error(err); }
        });
    }

    const sql = `
        INSERT INTO usuarios (
            nombres, apellidos, documento, telefono, direccion, correo, fechaNacimiento,
            afiliaciones_familiares, eps, arl, afp, ccf, carpeta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valores = [
        safeData.nombres, safeData.apellidos, safeData.documento, safeData.telefono,
        safeData.direccion, safeData.correo, safeData.fechaNacimiento,
        safeData.afiliacionesFamiliares, safeData.epsNombre, safeData.arlNombre,
        safeData.afpNombre, safeData.ccfNombre, fullName
    ];

    db.query(sql, valores, async (err) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        try {
            await correoOutlook.sendMail({
                from: "eagudelo@woden.com.co",
                to: safeData.correo,
                subject: "Registro exitoso - WMS",
                html: `<h3>Hola ${safeData.nombres},</h3><p>Documentos recibidos.</p>`
            });
        } catch (e) { console.error(e); }

        res.status(200).json({ status: 'ok', message: 'Registro exitoso.' });
    });
});

// ==========================================
// RUTAS DE SUBSANACIÓN (MAGIC LINKS)
// ==========================================

// A. ADMIN SOLICITA SUBSANACIÓN
router.post("/solicitar-subsanar", (req, res) => {
    const { id, motivo } = req.body; 
    const token = crypto.randomBytes(20).toString('hex');
    const sql = "UPDATE usuarios SET token_subsanar = ?, fecha_solicitud_subsanar = NOW() WHERE id = ?";
    
    db.query(sql, [token, id], (err, result) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        db.query("SELECT nombres, correo FROM usuarios WHERE id = ?", [id], async (err, users) => {
            if(!users || users.length === 0) return res.status(404).json({status: 'error', message: 'Usuario no encontrado'});
            
            const usuario = users[0];
            // CAMBIA LOCALHOST POR TU IP SI LO PRUEBAS DESDE OTRO PC
            const link = `${URL_BASE}/subsanar.html?token=${token}`; 

            try {
                await correoOutlook.sendMail({
                    from: "eagudelo@woden.com.co",
                    to: usuario.correo,
                    subject: "⚠️ Acción Requerida: Corregir Documentos - WMS",
                    html: `
                        <div style="font-family: Arial, padding: 20px;">
                            <h3 style="color: #d35400;">Hola ${usuario.nombres},</h3>
                            <p>Necesitamos que corrijas documentación:</p>
                            <div style="background:#fdede8; padding:15px; border-left: 5px solid #d35400;">
                                <strong>Motivo:</strong> ${motivo}
                            </div>
                            <br>
                            <a href="${link}" style="background:#d35400; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Subir Documentos</a>
                        </div>
                    `
                });
                res.json({ status: 'ok', message: 'Solicitud enviada al usuario' });
            } catch (e) {
                console.error(e);
                res.status(500).json({ status: 'error', message: 'Error enviando correo' });
            }
        });
    });
});

// B. VALIDAR TOKEN
router.get("/validar-token/:token", (req, res) => {
    const token = req.params.token;
    db.query("SELECT id, nombres, apellidos FROM usuarios WHERE token_subsanar = ?", [token], (err, result) => {
        if (err || result.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Enlace inválido o expirado.' });
        }
        res.json({ status: 'ok', usuario: result[0] });
    });
});

// C. SUBIR CORRECCIÓN
router.post("/subir-correccion", upload.any(), (req, res) => {
    const { token, tipoDocumento } = req.body;
    
    // 1. Buscamos al usuario dueño del token para saber su carpeta
    db.query("SELECT * FROM usuarios WHERE token_subsanar = ?", [token], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Token inválido o expirado' });
        }
        
        const usuario = results[0];
        // Asegúrate de que la ruta 'uploads' esté bien referenciada según tu estructura de carpetas
        const userFolder = path.join(__dirname, "..", "uploads", usuario.carpeta || ""); 

        // Variable para listar los archivos en el correo
        let listaArchivos = [];

        // 2. Movemos el archivo
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                const oldPath = file.path;
                
                // Generamos nombre único por si sube varios del mismo tipo
                const ext = path.extname(file.originalname);
                // Agregamos un número (index) o fecha para que no se sobrescriban si sube 2 archivos
                const nuevoNombre = `${tipoDocumento}_CORREGIDO_${Date.now()}_${index}${ext}`; 
                
                const newPath = path.join(userFolder, nuevoNombre);
                
                try {
                    // Si la carpeta del usuario no existe, la creamos (por seguridad)
                    if (!fs.existsSync(userFolder)){ fs.mkdirSync(userFolder, { recursive: true }); }

                    fs.renameSync(oldPath, newPath);
                    listaArchivos.push(nuevoNombre); // Guardamos el nombre para el email
                } catch (mvErr) {
                    console.error("Error moviendo corrección:", mvErr);
                }
            });
        }

        // 3. Borramos el token por seguridad
        db.query("UPDATE usuarios SET token_subsanar = NULL WHERE id = ?", [usuario.id]);

        // ============================================================
        // 4. (NUEVO) NOTIFICAR A LOS SUPER ADMINS
        // ============================================================
        db.query("SELECT email FROM notificaciones", (errNotif, resNotif) => {
            if (!errNotif && resNotif.length > 0) {
                
                // Sacamos los correos de la DB
                const listaCorreos = resNotif.map(r => r.email).join(', ');
                const transporter = req.transporter; // Viene del server.js

                if (transporter) {
                    const mailOptions = {
                        from: '"Sistema de Documentos" <eagudelo@woden.com.co>',
                        to: listaCorreos,
                        subject: `📢 Corrección Recibida: ${usuario.nombre}`,
                        html: `
                            <div style="font-family: Arial; padding: 20px; border: 1px solid #eee;">
                                <h2 style="color: #2c3e50;">Documentación Subsanada</h2>
                                <p>El colaborador <strong>${usuario.nombre}</strong> ha cargado nuevos archivos.</p>
                                
                                <ul style="background: #f9f9f9; padding: 15px;">
                                    <li><strong>Tipo reportado:</strong> ${tipoDocumento}</li>
                                    <li><strong>Archivos subidos:</strong> ${listaArchivos.length}</li>
                                    <li><strong>Nombres:</strong> ${listaArchivos.join(', ')}</li>
                                </ul>

                                <br>
                                <a href="${URL_BASEDEV}/panel-administrativo" 
                                   style="background: #3498db; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
                                    Ir al Panel de Revisión
                                </a>
                            </div>
                        `
                    };

                    // Enviamos el correo (sin esperar el callback para que el usuario no espere)
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) console.log("Error enviando notificación:", error);
                        else console.log("📧 Notificación enviada a admins.");
                    });
                }
            }
        });
        // ============================================================

        // 5. Notificar éxito al frontend
        res.json({ status: 'ok', message: 'Archivos recibidos y notificación enviada.' });
    });
});

module.exports = router;