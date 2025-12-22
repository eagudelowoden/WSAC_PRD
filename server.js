// ==========================================
// 1. CARGAR VARIABLES DE ENTORNO
// ==========================================
require("dotenv").config();

const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const db = require("./databases/db");
const URL_BASEDEV = process.env.URL_BASEDEV;
// Importar Rutas
const apiRoutes = require("./routes/api");
const docRoutes = require('./routes/routesDocs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const app = express();

// ==========================================
// 2. CONFIGURACIONES GLOBALES (MySQL Store y Correo)
// ==========================================
const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore({}, db);

const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.OUTLOOK_USER, pass: process.env.OUTLOOK_PASS },
});

transporter.verify((error) => {
    if (error) console.log("❌ Error conectando al correo:", error);
    else console.log("✅ Servidor de correo listo.");
});

// ==========================================
// 3. MIDDLEWARES PRINCIPALES (IMPORTANTE: EL ORDEN IMPORTA)
// ==========================================

// A. PARSEADORES DE DATOS (Esto soluciona tu error de 'undefined')
// Deben ir antes de CUALQUIER ruta
app.use(bodyParser.json()); 
app.use(bodyParser.urlencoded({ extended: true }));

// B. ARCHIVOS ESTÁTICOS
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// C. SESIONES
app.use(session({
    key: "session_cookie_name",
    secret: "secreto_mysql_seguro",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 } // 1 día
}));

// D. INYECCIÓN DE UTILIDADES (Correo y BD) EN EL REQUEST
app.use((req, res, next) => {
    req.transporter = transporter;
    // Cargamos emails de notificaciones en cada petición por si se necesitan
    db.query("SELECT email FROM notificaciones", (err, results) => {
        req.emailsNotificaciones = results ? results.map((r) => r.email) : [];
        next();
    });
});

// ==========================================
// 4. DEFINICIÓN DE RUTAS
// ==========================================

// A. RUTAS DE DOCUMENTOS (Word)
app.use('/api/docs', docRoutes);

// B. RUTAS GENERALES API
app.use('/api', apiRoutes);

// C. LOGIN
// C. LOGIN (Modificado para soportar Session y JWT al mismo tiempo)
app.post("/api/login", (req, res) => {
    const { usuario, password } = req.body;

    db.query("SELECT * FROM usuariossys WHERE usuario = ?", [usuario], (err, results) => {
        if (err) return res.status(500).json({ status: "error", message: "Error servidor" });
        if (results.length === 0) return res.status(401).json({ status: "error", message: "Usuario no encontrado" });

        const user = results[0];

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (isMatch) {
                const tokenPayload = { 
                    id: user.id, 
                    nombre: user.nombre, 
                    rol: user.rol 
                };

                // --- ESTO ES LO QUE FALTA ---
                // Guardamos en la sesión para que 'verificarAuth' no te rebote
                req.session.usuario = tokenPayload; 

                const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'Secret_WSAC_Key_123', { 
                    expiresIn: '8h' 
                });

                let redirectUrl = "/panel-administrativo";
                if (user.rol === "superadmin") redirectUrl = "/superadmin";
                else if (user.rol === "aprobadorDos") redirectUrl = "/panel-aprobacionesDos";

                // Guardamos la sesión explícitamente antes de responder
                req.session.save((err) => {
                    if (err) return res.status(500).json({ status: "error", message: "Error al crear sesión" });
                    
                    return res.json({ 
                        status: "ok", 
                        message: "Bienvenido",
                        token: token,
                        usuario: tokenPayload,
                        redirect: redirectUrl 
                    });
                });

            } else {
                return res.status(401).json({ status: "error", message: "Contraseña incorrecta" });
            }
        });
    });
});

app.get("/api/logout", (req, res) => req.session.destroy(() => res.redirect("/login.html")));

// ==========================================
// 5. RUTAS DE VISTAS Y SEGURIDAD
// ==========================================

function verificarAuth(req, res, next) {
    if (req.session.usuario) next();
    else res.redirect("/login.html");
}

function verificarSuperAdmin(req, res, next) {
    if (req.session.usuario && req.session.usuario.rol === "superadmin") next();
    else res.redirect("/panel-administrativo");
}

// Redirección Raíz
app.get("/", (req, res) => {
    if(req.session.usuario) res.redirect("/panel-administrativo");
    else res.redirect("/login.html");
});

// Vistas Públicas/Privadas
app.get("/visualizar.html", (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "visualizar.html")));
app.get("/registro.html", (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "registro.html")));
app.get("/subsanar.html", (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "subsanar.html")));

// Paneles
app.get("/panel-administrativo", verificarAuth, (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "index.html")));
app.get("/panel-aprobacionesDos", verificarAuth, (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "aprobacionesDos.html")));
app.get("/superadmin", verificarSuperAdmin, (req, res) => res.sendFile(path.join(__dirname, "vistas_privadas", "superadmin.html")));

// ==========================================
// 6. API ADMIN (Usuarios y Emails)
// ==========================================
app.get("/api/admin/users", verificarSuperAdmin, (req, res) => {
    db.query("SELECT id, nombre, usuario, rol FROM usuariossys", (err, results) => {
        if (err) return res.status(500).json([]);
        res.json(results);
    });
});



app.post("/api/admin/users", verificarSuperAdmin, (req, res) => {
    const { nombre, usuario, password, rol } = req.body;
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ error: "Error encriptando" });
        db.query("INSERT INTO usuariossys (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)", 
            [nombre, usuario, hash, rol], (err, result) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") return res.json({ status: "error", message: "Usuario ya existe" });
                return res.json({ status: "error", message: "Error BD" });
            }
            res.json({ status: "ok", id: result.insertId });
        });
    });
});

// --- LÓGICA DE PERMISOS (NUEVO) ---

// Obtener permisos de un usuario
app.get("/api/admin/permisos/:id", verificarAuth, (req, res) => {
    const sql = "SELECT seccion, puede_editar FROM permisos_edicion WHERE usuario_id = ?";
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const mapaPermisos = results.reduce((acc, p) => {
            acc[p.seccion] = p.puede_editar === 1;
            return acc;
        }, {});
        res.json(mapaPermisos);
    });
});

// Guardar o actualizar permisos
app.post("/api/admin/permisos", verificarSuperAdmin, (req, res) => {
    const { usuario_id, permisos } = req.body;

    if (!usuario_id) return res.status(400).json({ error: "Falta id" });

    // Preparamos las promesas para insertar/actualizar cada permiso
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
        .catch(err => res.status(500).json({ error: err.message }));
});

app.delete("/api/admin/users/:id", verificarSuperAdmin, (req, res) => {
    db.query("DELETE FROM usuariossys WHERE id = ?", [req.params.id], (err) => res.json({ status: err ? "error" : "ok" }));
});

// Emails Admin
app.get("/api/admin/emails", verificarSuperAdmin, (req, res) => {
    db.query("SELECT email FROM notificaciones", (err, results) => {
        if (err) return res.json([]);
        res.json(results.map((r) => r.email));
    });
});
app.post("/api/admin/emails", verificarSuperAdmin, (req, res) => {
    db.query("INSERT INTO notificaciones (email) VALUES (?)", [req.body.email], (err) => res.json({ status: err ? "error" : "ok" }));
});
app.delete("/api/admin/emails", verificarSuperAdmin, (req, res) => {
    db.query("DELETE FROM notificaciones WHERE email = ?", [req.body.email], (err) => res.json({ status: "ok" }));
});
const cors = require('cors');

app.use(cors({
    origin: '*', // O tu dominio específico
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // <--- ESTO ES CLAVE: Caché del permiso por 24 horas
}));

// ==========================================
// 7. INICIAR SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en ${URL_BASEDEV}`);
});