// UBICACIÓN: routes/api.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../databases/db"); 
const nodemailer = require("nodemailer");
const crypto = require('crypto');
// IMPORTAMOS LIBRERÍAS DE AWS
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const PORT = process.env.PORT;
const RUTA_SEGMENTOS = process.env.SEGMENTOS;
const URL_BASE = process.env.URL_BASE;
const fsPromises = require('fs').promises; 
const { vincularDescripcionCargo } = require("../services/cargoPdfService");
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

const uploadSeguro = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
    fileFilter: (req, file, cb) => {
        const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo incorrecto: ${file.originalname}`));
        }
    }
});
// FUNCIÓN AUXILIAR: Detectar el ADN real del archivo (Magic Numbers)
const validarFirmaReal = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    
    // Convertimos los primeros 4 bytes a Hexadecimal
    const hex = buffer.toString('hex', 0, 4).toUpperCase();
    
    // Firmas conocidas:
    // FFD8FF = JPG/JPEG
    // 89504E47 = PNG
    // 25504446 = PDF (%PDF)
    
    if (hex.startsWith('FFD8FF')) return true;   // Es JPG
    if (hex.startsWith('89504E47')) return true; // Es PNG
    if (hex.startsWith('25504446')) return true; // Es PDF
    
    return false; // Es un impostor (EXE, JS, PHP, SH, etc.)
};
const uploadMiddleware = uploadSeguro.fields([
    { name: 'cedula', maxCount: 1 },
    { name: 'estudios', maxCount: 5 },
    { name: 'laborales', maxCount: 5 },
    { name: 'cesantias', maxCount: 1 },
    { name: 'cuenta', maxCount: 1 },
    { name: 'epsDocs', maxCount: 5 },
    { name: 'referencias', maxCount: 2 },
    { name: 'agenteCampo', maxCount: 5 },
    { name: 'hv', maxCount: 1 },
    { name: 'habeas', maxCount: 1 },
    { name: 'consentimiento', maxCount: 1 }
]);


// ==========================================
// 1. CONFIGURACIÓN GENERAL
// ==========================================

// A. CONFIGURACIÓN CLIENTE S3 (AWS)
const s3Client = new S3Client({
    region: process.env.AWS_REGION, 
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'documentosnominaycontratacion';

// B. RUTA DE CARPETAS DE SEGMENTOS (ESTÁTICAS LOCALES)
// Esta ruta SE MANTIENE LOCAL porque son archivos fijos de la empresa en tu servidor
//const RUTA_SEGMENTOS = "C:\\Users\\Daniel\\OneDrive - WODEN COLOMBIA SAS\\MigracionCapitalHumano\\PublicaSegmentos";

// C. CONFIGURACIÓN MULTER (EN MEMORIA)
// ¡IMPORTANTE! Usamos memoryStorage para poder mandar el archivo a la nube.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// D. CONFIGURACIÓN CORREO
const correoOutlook = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: "eagudelo@woden.com.co", pass: "WmsWeb2025**" }
});

// ==========================================
// 2. RUTAS DE INFORMACIÓN (GET)
// ==========================================

// Listar Usuarios
router.get("/usuarios", (req, res) => {
    // Llamada al SP
    const query = "CALL sp_ListarUsuariosResumen()";

    db.query(query, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // RECUERDA: Los SP devuelven [filas, paquetes_extra]
        // Tus datos están en la posición 0
        const listaUsuarios = result[0];

        res.json(listaUsuarios);
    });
});

router.get("/usuario/:id", (req, res) => {
   
    // Llamamos al SP en lugar de escribir el SELECT
    const query = "CALL sp_ObtenerUsuarioPorId(?)";

    db.query(query, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // OJO AQUÍ: 
        // Los SP devuelven un array de resultados. El primer elemento (result[0])
        // es la lista de filas que encontró.
          
        
        const filasEncontradas = result[0];

        // Validación: Si el array de filas está vacío
        if (!filasEncontradas || filasEncontradas.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // Devolvemos la primera fila del primer resultado
        res.json(filasEncontradas[0]);
    });
});
// Listar Segmentos (Local)
router.get("/segmentos", (req, res) => {
    try {
        if (!fs.existsSync(RUTA_SEGMENTOS)) {
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
router.get("/session/actual", (req, res) => {
    // Verificamos si hay sesión guardada (según tu login anterior)
    if (req.session && req.session.usuario) {
        res.json({ status: "ok", usuario: req.session.usuario });
    } else {
        res.status(401).json({ status: "error", message: "No logueado" });
    }
});


// Listar Cargos por Segmento (Local)
router.get("/cargos-por-segmento/:segmento", async (req, res) => {
    try {
        const segmento = req.params.segmento;
        const rutaCompleta = path.join(RUTA_SEGMENTOS, segmento);

        // existsSync es muy rápido, se puede dejar, pero lo ideal es manejar el error en readdir
        if (!fs.existsSync(rutaCompleta)) return res.json([]);

        // CAMBIO AQUÍ: Usamos await y readdir (sin Sync)
        const archivosBrutos = await fsPromises.readdir(rutaCompleta);

        // Filtramos en memoria (esto es rapidísimo)
        const archivosFiltrados = archivosBrutos.filter(file => 
            file.toLowerCase().endsWith('.pdf') || file.toLowerCase().endsWith('.docx')
        );

        res.json(archivosFiltrados);

    } catch (error) {
        console.error("Error leyendo carpeta:", error);
        // Si la carpeta no existe, readdir lanza error, devolvemos array vacío
        if (error.code === 'ENOENT') return res.json([]);
        
        res.status(500).json({ error: "Error leyendo cargos" });
    }
});

// ==========================================
// 3. RUTAS DE ARCHIVOS EN LA NUBE (S3)
// ==========================================

// Listar y Generar URLs firmadas para ver archivos
router.get("/archivos/:carpeta", async (req, res) => {
    const carpetaUsuario = req.params.carpeta; 
    
    try {
        // 1. Listamos los archivos
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: carpetaUsuario + "/" 
        });
        
        const response = await s3Client.send(command);
        
        // 2. Generamos URLs firmadas
        const filesPromises = (response.Contents || []).map(async (item) => {
            const fileName = item.Key.split('/').pop();
            
            const getCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: item.Key
            });

            const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

            return {
                name: fileName,
                url: signedUrl 
            };
        });

        const files = await Promise.all(filesPromises);
        res.json(files);
    } catch (err) {
        console.error("Error listando archivos S3:", err);
        res.json([]); 
    }
});

// ==========================================
// 4. RUTA PRINCIPAL DE REGISTRO (/enviar)
// ==========================================
router.post("/enviar", (req, res, next) => {
    // Middleware wrapper para capturar errores de Multer limpiamente
    uploadMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ status: 'error', message: `Error subiendo archivos: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ status: 'error', message: err.message });
        }
        next();
    });
}, async (req, res) => {

    try {
        const data = req.body;

        // --- TRUCO: Aplanar archivos ---
        // Como usamos upload.fields(), req.files es un Objeto { cedula: [...], hv: [...] }
        // Lo convertimos a un Array simple para usar tu lógica de S3 existente.
        let filesArray = [];
        if (req.files) {
            Object.values(req.files).forEach(files => {
                filesArray = filesArray.concat(files);
            });
        }

        // 1. VALIDACIÓN
        if (filesArray.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Debes adjuntar al menos un documento.' });
        }

        const safeData = {
            ...data,
            afiliacionesFamiliares: data.afiliacionesFamiliares || '',
            observaciones: data.observaciones || '',
            otroSi: data.otroSi || '' 
        };

        // Sanitizar nombre de carpeta (reemplazar espacios por guiones bajos)
        const folderName = `${safeData.nombres}_${safeData.apellidos}`.trim().replace(/\s+/g, '_');
        const fullName = folderName; 

        // 2. SUBIR A S3 (Usamos filesArray que creamos arriba)
        const uploadPromises = filesArray.map(file => {
            const cleanOriginalName = file.originalname.replace(/\s+/g, '_');
            const fileName = `${Date.now()}_${cleanOriginalName}`;
            
            const key = `${folderName}/${fileName}`; 

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype
            });
            return s3Client.send(command);
        });
        
        await Promise.all(uploadPromises);

        // 3. GUARDAR EN BASE DE DATOS
        const sql = `
            INSERT INTO usuarios (
                nombres, apellidos, documento, telefono, direccion, correo, fechaNacimiento,
                afiliaciones_familiares, eps, arl, afp, ccf, carpeta
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const valores = [
            safeData.nombres, 
            safeData.apellidos, 
            safeData.documento, 
            safeData.telefono,
            safeData.direccion, 
            safeData.correo, 
            safeData.fechaNacimiento,
            safeData.afiliacionesFamiliares, 
            safeData.epsNombre, 
            safeData.arlNombre,
            safeData.afpNombre, 
            safeData.ccfNombre,
            fullName // Guardamos la carpeta correctamente
        ];

        db.query(sql, valores, async (err) => {
            if (err) {
                console.error("Error SQL:", err);
                return res.status(500).json({ status: 'error', message: 'Error guardando en BD: ' + err.message });
            }

            // Enviar correo de confirmación
            try {
                await correoOutlook.sendMail({
                    from: "eagudelo@woden.com.co",
                    to: safeData.correo,
                    subject: "Registro exitoso",
                    html: `<h3>Hola ${safeData.nombres},</h3><p>Tus documentos han sido recibidos y almacenados correctamente.</p>`
                });
            } catch (e) { console.error("Error enviando correo:", e); }

            res.status(200).json({ status: 'ok', message: 'Registro exitoso.' });
        });

    } catch (generalError) {
        console.error("Error en ruta /enviar:", generalError);
        res.status(500).json({ status: 'error', message: 'Error procesando solicitud' });
    }
});

router.put("/usuario/:id", async (req, res) => { // OJO: Ahora es async
    const id = req.params.id;
    const data = req.body;

    try {
        // ============================================================
        // 1. LÓGICA DE SUBIDA DE "DESCRIPCIÓN DE CARGO" A S3
        // ============================================================
        // Si nos envían un segmento y un PDF de cargo, lo subimos a la carpeta del usuario en S3
        if (data.segmento_contrato && data.descripcion_cargo) {
            
            // A. Primero necesitamos saber la carpeta del usuario en S3
            // Hacemos una consulta rápida para obtenerla
            const [userRows] = await db.promise().query("SELECT carpeta, nombres, apellidos FROM usuarios WHERE id = ?", [id]);
            
            if (userRows.length > 0) {
                let userFolder = userRows[0].carpeta;
                // Si por alguna razón no tiene carpeta, usamos Nombres + Apellidos
                if (!userFolder) {
                    userFolder = `${userRows[0].nombres} ${userRows[0].apellidos}`.trim();
                }

                // B. Buscamos el archivo en tu disco local
                const rutaLocalPDF = path.join(RUTA_SEGMENTOS, data.segmento_contrato, data.descripcion_cargo);

                if (fs.existsSync(rutaLocalPDF)) {
                    // C. Leemos el archivo
                    const fileContent = fs.readFileSync(rutaLocalPDF);
                    
                    // D. Preparamos la subida a S3
                    // Lo guardamos con un prefijo para identificarlo fácil, ej: "CARGO_Analista.pdf"
                    const s3Key = `${userFolder}/CARGO_${data.descripcion_cargo}`;

                    const command = new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: s3Key,
                        Body: fileContent,
                        ContentType: 'application/pdf' 
                    });

                    // E. Subimos a S3
                    await s3Client.send(command);
                    console.log(`✅ Descripción de cargo subida a S3: ${s3Key}`);
                } else {
                    console.warn(`⚠️ El archivo local no existe: ${rutaLocalPDF}`);
                }
            }
        }
        // ============================================================


        // 2. ACTUALIZACIÓN EN BASE DE DATOS (Igual que antes)
        const sql = `
            UPDATE usuarios SET 
                nombres = ?, apellidos = ?, documento = ?, telefono = ?, direccion = ?, 
                correo = ?, fechaNacimiento = ?, eps = ?, arl = ?, afp = ?, ccf = ?, 
                ciudad = ?, salario = ?, cargo = ?, afiliaciones_familiares = ?,
                observaciones = ?, 
                segmento_contrato = ?, 
                descripcion_cargo = ?, 
                aprobacion = ?,
                otro_si = ?,
                fecha_suscripcion = ?
            WHERE id = ?
        `;

        const valores = [
            data.nombres, data.apellidos, data.documento, data.telefono, data.direccion,
            data.correo, data.fechaNacimiento, data.epsNombre || data.eps, 
            data.arlNombre || data.arl, data.afpNombre || data.afp, 
            data.ccfNombre || data.ccf, data.ciudad, data.salario, 
            data.cargo, data.afiliaciones_familiares,
            data.observaciones,
            data.segmento_contrato,
            data.descripcion_cargo,
            data.aprobacion,
            data.otroSi,
            data.fechaSuscripcion || null,
            id
        ];

        // Usamos await con la versión promesa de mysql2 o callback tradicional envuelto
        // Nota: Si tu 'db' no soporta .promise(), usa callback tradicional así:
        db.query(sql, valores, (err, result) => {
            if (err) {
                console.error("Error SQL:", err);
                return res.status(500).json({ status: 'error', message: err.message });
            }
            res.json({ status: 'ok', message: 'Datos actualizados y cargo subido a la nube' });
        });

    } catch (error) {
        console.error("Error en PUT /usuario:", error);
        res.status(500).json({ status: 'error', message: 'Error interno procesando la solicitud' });
    }
});
// Eliminar usuario y sus archivos de S3
router.delete("/usuario/:id", (req, res) => {
    const id = req.params.id;

    // 1. Buscamos nombre de carpeta
    db.query("SELECT carpeta FROM usuarios WHERE id = ?", [id], async (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ status: 'error', message: 'Usuario no encontrado' });

        const folderName = results[0].carpeta;
        
        // 2. Borrar de S3
        if (folderName) {
            try {
                const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: folderName + "/" });
                const listResponse = await s3Client.send(listCommand);

                if (listResponse.Contents && listResponse.Contents.length > 0) {
                    const objectsToDelete = listResponse.Contents.map(item => ({ Key: item.Key }));
                    await s3Client.send(new DeleteObjectsCommand({
                        Bucket: BUCKET_NAME,
                        Delete: { Objects: objectsToDelete }
                    }));
                }
            } catch (s3Error) { console.error("Error borrando S3:", s3Error); }
        }

        // 3. Borrar de BD
        db.query("DELETE FROM usuarios WHERE id = ?", [id], (errDelete) => {
            if (errDelete) return res.status(500).json({ status: 'error' });
            res.json({ status: 'ok', message: 'Usuario y archivos eliminados' });
        });
    });
});

// ==========================================
// 6. RUTAS DE SUBSANACIÓN (CON SUBIDA A S3)
// ==========================================

// A. ADMIN SOLICITA SUBSANACIÓN
router.post("/solicitar-subsanar", (req, res) => {
    const { id, motivo } = req.body; 
    const token = crypto.randomBytes(20).toString('hex');
    
    db.query("UPDATE usuarios SET token_subsanar = ?, fecha_solicitud_subsanar = NOW() WHERE id = ?", [token, id], (err) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });

        db.query("SELECT nombres, correo FROM usuarios WHERE id = ?", [id], async (err, users) => {
            if(!users || users.length === 0) return res.status(404).json({status: 'error', message: 'Usuario no encontrado'});
            
            const usuario = users[0];
            const link = `${URL_BASE}/subsanar.html?token=${token}`; 

            try {
                await correoOutlook.sendMail({
                    from: "eagudelo@woden.com.co",
                    to: usuario.correo,
                    subject: "⚠️ Acción Requerida: Corregir Documentos - WMS",
                    html: `<p>Hola ${usuario.nombres}, por favor corrige: <strong>${motivo}</strong><br><a href="${link}">Subir Documentos</a></p>`
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
        if (err || result.length === 0) return res.status(404).json({ status: 'error', message: 'Enlace inválido o expirado.' });
        res.json({ status: 'ok', usuario: result[0] });
    });
});
// GET /api/ver-archivo?key=ruta/al/archivo.pdf
router.get("/ver-archivo", async (req, res) => {
    const { token } = req.query; // Cambiamos 'key' por 'token' para que se vea más pro

    if (!token) return res.status(400).send("Falta el token del archivo");

    try {
        // 1. DECODIFICAR EL "HASH" (Base64 a Texto)
        // El frontend nos manda algo como "dXN1YXJpby80..." y nosotros recuperamos la ruta real
        const keyReal = Buffer.from(token, 'base64').toString('utf-8');

        const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: keyReal
        });

        // 2. PEDIR EL ARCHIVO A S3 (Sin firmar URL, pedimos el objeto directo)
        const response = await s3Client.send(getCommand);

        // 3. CONFIGURAR CABECERAS (Para que el navegador sepa qué es)
        res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${keyReal.split('/').pop()}"`);

        // 4. STREAMING (La magia 🎩)
        // En lugar de redirigir, "entubamos" el archivo de S3 directo al usuario
        // El usuario verá: http://localhost:8081/api/ver-archivo?token=XYZ...
        // Nunca verá s3.amazonaws.com
        response.Body.pipe(res);

    } catch (err) {
        console.error("Error streaming archivo:", err);
        // Evitamos dar pistas del error exacto al usuario
        res.status(404).send("Archivo no disponible o acceso denegado.");
    }
});

// C. SUBIR CORRECCIÓN A S3
router.post("/subir-correccion", upload.any(), async (req, res) => {
    const { token, tipoDocumento } = req.body;
    
    try {
        const usuario = await new Promise((resolve, reject) => {
            db.query("SELECT * FROM usuarios WHERE token_subsanar = ?", [token], (err, results) => {
                if (err) reject(err);
                else if (results.length === 0) resolve(null);
                else resolve(results[0]);
            });
        });

        if (!usuario) return res.status(404).json({ status: 'error', message: 'Token inválido' });

        const folderName = usuario.carpeta || `${usuario.nombres} ${usuario.apellidos}`.trim();
        let listaArchivos = [];

        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map((file, index) => {
                const ext = path.extname(file.originalname);
                const nuevoNombre = `${tipoDocumento}_CORREGIDO_${Date.now()}_${index}${ext}`;
                const key = `${folderName}/${nuevoNombre}`;
                
                listaArchivos.push(nuevoNombre);

                const command = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: key,
                    Body: file.buffer,
                    ContentType: file.mimetype
                });
                return s3Client.send(command);
            });
            await Promise.all(uploadPromises);
        }

        db.query("UPDATE usuarios SET token_subsanar = NULL WHERE id = ?", [usuario.id]);

        db.query("SELECT email FROM notificaciones", async (errNotif, resNotif) => {
            if (!errNotif && resNotif.length > 0) {
                const listaCorreos = resNotif.map(r => r.email).join(', ');
                try {
                    await correoOutlook.sendMail({
                        from: '"Sistema de Documentos" <eagudelo@woden.com.co>',
                        to: listaCorreos,
                        subject: `📢 Corrección Recibida: ${usuario.nombres}`,
                        html: `<p>El usuario ${usuario.nombres} ha subido ${listaArchivos.length} archivos corregidos.</p>`
                    });
                } catch (e) { console.error("Error notificando admin:", e); }
            }
        });

        res.json({ status: 'ok', message: 'Archivos recibidos y guardados en la nube.' });

    } catch (error) {
        console.error("Error en subir-correccion:", error);
        res.status(500).json({ status: 'error', message: 'Error interno del servidor' });
    }
});

router.post("/vincular-cargo-pdf", async (req, res) => {
    const { idColaborador, archivoPdf, segmento } = req.body;
    try {
        const resultado = await vincularDescripcionCargo(idColaborador, archivoPdf, segmento);
        res.json(resultado);
    } catch (error) {
        console.error("Error en servicio PDF:", error);
        res.status(500).json({ status: "error", message: error.toString() });
    }
});

module.exports = router;