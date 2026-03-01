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
const docRoutes = require("./routes/routesDocs");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 3000;
const app = express();

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const serverID = Date.now().toString();
const io = new Server(server);
global.io = io;
app.use(express.json());

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
app.use(
  session({
    key: "session_cookie_name",
    secret: "secreto_mysql_seguro",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 }, // 1 día
  }),
);

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
app.use("/api/docs", docRoutes);

// B. RUTAS GENERALES API
app.use("/api", apiRoutes);

// C. LOGIN
// C. LOGIN (Modificado para soportar Session y JWT al mismo tiempo)
app.post("/api/login", (req, res) => {
  const { usuario, password } = req.body;

  db.query(
    "SELECT * FROM usuariosSys WHERE usuario = ?",
    [usuario],
    (err, results) => {
      if (err)
        return res
          .status(500)
          .json({ status: "error", message: "Error servidor" });
      if (results.length === 0)
        return res
          .status(401)
          .json({ status: "error", message: "Usuario no encontrado" });

      const user = results[0];

      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (isMatch) {
          const tokenPayload = {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
          };

          // --- ESTO ES LO QUE FALTA ---
          // Guardamos en la sesión para que 'verificarAuth' no te rebote
          req.session.usuario = tokenPayload;

          const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET || "Secret_WAS_Key_123",
            {
              expiresIn: "8h",
            },
          );

          let redirectUrl = "/panel-administrativo";
          if (user.rol === "superadmin") redirectUrl = "/superadmin";
          else if (user.rol === "aprobadorDos")
            redirectUrl = "/panel-aprobacionesDos";

          // Guardamos la sesión explícitamente antes de responder
          req.session.save((err) => {
            if (err)
              return res
                .status(500)
                .json({ status: "error", message: "Error al crear sesión" });

            return res.json({
              status: "ok",
              message: "Bienvenido",
              token: token,
              usuario: tokenPayload,
              redirect: redirectUrl,
            });
          });
        } else {
          return res
            .status(401)
            .json({ status: "error", message: "Contraseña incorrecta" });
        }
      });
    },
  );
});

// AGREGA ESTO AQUÍ (Justo después de 'const app = express()')
// ==========================================
// LÓGICA DE SOCKETS (TIEMPO REAL)
// ==========================================
io.on("connection", (socket) => {
    // ✅ Usamos la constante serverID que se generó una sola vez al arrancar
    console.log(`🔌 Cliente conectado [ID: ${socket.id}] - Versión: ${serverID}`);

    // 1. Enviamos la versión FIJA del arranque
    socket.emit("version-actual", serverID);

    // 2. Enviamos el estado de mantenimiento inicial
    const queryMaint = "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1";
    db.query(queryMaint, (err, result) => {
        if (!err && result.length > 0) {
            socket.emit("mantenimiento", result[0]);
        }
    });

    socket.on("disconnect", () => {
        console.log(`👋 Cliente desconectado: ${socket.id}`);
    });
});

// Endpoint para el Polling (Usa la misma constante serverID)
app.get("/api/check-version", (req, res) => {
  console.log("🔍 Petición de chequeo de versión recibida"); // Esto te servirá para ver en consola si llega
  res.json({ version: serverID });
});
// Variable global para guardar el estado del aviso
let avisoMantenimientoApp = {
  activo: false,
  mensaje: "",
  fecha: "",
};

// RUTA 1: Para que cualquier usuario consulte si hay mantenimiento
// RUTA 1 CORREGIDA: Consulta a la base de datos, no a la variable vacía
app.get("/api/check-mantenimiento", (req, res) => {
  const query =
    "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1";

  db.query(query, (err, result) => {
    if (err) {
      console.error("❌ Error al consultar mantenimiento:", err);
      return res.status(500).json({ error: err.message });
    }

    // Si la tabla tiene datos, devolvemos la fila 1
    if (result.length > 0) {
      res.json(result[0]);
    } else {
      // Si por alguna razón la tabla está vacía, devolvemos un estado por defecto
      res.json({ activo: false, mensaje: "", fecha: "" });
    }
  });
});
app.post("/api/update-mantenimiento", (req, res) => {
  const { activo, mensaje, fecha } = req.body;

  // 1. Guardamos en la Base de Datos (Persistencia)
  const query =
    "UPDATE mantenimiento SET activo = ?, mensaje = ?, fecha = ? WHERE id = 1";

  db.query(query, [activo, mensaje, fecha], (err, result) => {
    if (err) {
      console.error("❌ Error en DB:", err);
      return res.status(500).json({ error: err.message });
    }

    // 2. Preparamos el objeto para el grito (Socket)
    const datosAviso = { activo, mensaje, fecha };

    // 3. ¡LA MAGIA! Emitimos a todos los clientes (Tiempo Real)
    // Usamos io o global.io según como lo tengas definido
    const socketInstance = global.io || io;

    if (socketInstance) {
      socketInstance.emit("nuevo-aviso-global", datosAviso);
      console.log(
        "📢 Aviso emitido por Socket a todos los usuarios conectados",
      );
    } else {
      console.warn("⚠️ Socket.io no está inicializado correctamente");
    }

    res.json({
      status: "ok",
      mensaje: "Aviso guardado en DB y notificado por Socket",
    });
  });
});
// En tu archivo de rutas de Express (ej. routes/auth.js o app.js)
app.post("/api/logout", (req, res) => {
  // 1. Si usas Passport.js, esto limpia el objeto req.user
  if (req.logout) {
    req.logout(() => {});
  }

  // 2. Destruimos la sesión en el MySQLStore
  req.session.destroy((err) => {
    if (err) {
      console.error("Error al destruir la sesión:", err);
      return res
        .status(500)
        .json({ status: "error", message: "Error al cerrar sesión" });
    }

    // 3. Limpiamos la cookie del navegador de forma explícita
    // Usamos el nombre 'session_cookie_name' que definiste en tu config
    res.clearCookie("session_cookie_name", {
      path: "/", // Importante para que limpie la cookie en todo el sitio
      httpOnly: true,
    });

    // 4. Respondemos al frontend
    res.status(200).json({
      status: "ok",
      message: "Sesión eliminada en servidor y cookie limpiada",
    });
  });
});

// Función para registrar actividad
const registrarActividad = (accion) => {
  return (req, res, next) => {
    if (req.session && req.session.usuario) {
      const { id, nombre, rol } = req.session.usuario;
      const sql = `
        INSERT INTO logs_sistema (usuario_id, nombre_usuario, rol, accion, metodo_http, ruta_api, detalles)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      // Guardamos el cuerpo de la petición (sin passwords por seguridad)
      const bodyCopy = { ...req.body };
      if (bodyCopy.password) bodyCopy.password = "********"; 
      
      const detalles = JSON.stringify(bodyCopy);

      db.query(sql, [id, nombre, rol, accion, req.method, req.originalUrl, detalles], (err) => {
        if (err) console.error("⚠️ Error en log de auditoría:", err.message);
      });
    }
    next();
  };
};

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
  if (req.session.usuario) res.redirect("/panel-administrativo");
  else res.redirect("/login.html");
});

// Vistas Públicas/Privadas
app.get("/visualizar.html", (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "visualizar.html")),
);
app.get("/registro.html", (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "registro.html")),
);
app.get("/subsanar.html", (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "subsanar.html")),
);
app.get("/firmar.html", (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "firmar.html")),
);

// Paneles
app.get("/panel-administrativo", verificarAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "index.html")),
);
app.get("/panel-aprobacionesDos", verificarAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "aprobacionesDos.html")),
);
app.get("/superadmin", verificarSuperAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "vistas_privadas", "superadmin.html")),
);

// ==========================================
// 6. API ADMIN (Usuarios y Emails)
// ==========================================
app.get("/api/admin/users", verificarSuperAdmin, (req, res) => {
  db.query(
    "SELECT id, nombre, usuario, rol FROM usuariosSys",
    (err, results) => {
      if (err) return res.status(500).json([]);
      res.json(results);
    },
  );
});

app.post("/api/admin/users", verificarSuperAdmin, registrarActividad("Crear usuario"), (req, res) => {
  const { nombre, usuario, password, rol } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: "Error encriptando" });
    db.query(
      "INSERT INTO usuariosSys (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)",
      [nombre, usuario, hash, rol],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY")
            return res.json({ status: "error", message: "Usuario ya existe" });
          return res.json({ status: "error", message: "Error BD" });
        }
        res.json({ status: "ok", id: result.insertId });
      },
    );
  });
});

// --- LÓGICA DE PERMISOS (NUEVO) ---

// Obtener permisos de un usuario
app.get("/api/admin/permisos/:id", verificarAuth, (req, res) => {
  const sql =
    "SELECT seccion, puede_editar FROM permisos_edicion WHERE usuario_id = ?";
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
app.post("/api/admin/permisos", verificarSuperAdmin, registrarActividad("Actualizar permisos"), (req, res) => {
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
    .catch((err) => res.status(500).json({ error: err.message }));
});

app.delete("/api/admin/users/:id", verificarSuperAdmin, registrarActividad("Eliminar usuario"), (req, res) => {
  db.query("DELETE FROM usuariosSys WHERE id = ?", [req.params.id], (err) =>
    res.json({ status: err ? "error" : "ok" }),
  );
});

// Emails Admin
app.get("/api/admin/emails", verificarSuperAdmin, (req, res) => {
  db.query("SELECT email FROM notificaciones", (err, results) => {
    if (err) return res.json([]);
    res.json(results.map((r) => r.email));
  });
});
app.post("/api/admin/emails", verificarSuperAdmin, registrarActividad("Agregar correo notificaciones"), (req, res) => {
  db.query(
    "INSERT INTO notificaciones (email) VALUES (?)",
    [req.body.email],
    (err) => res.json({ status: err ? "error" : "ok" }),
  );
});
app.delete("/api/admin/emails", verificarSuperAdmin, registrarActividad("Eliminar correo notificaciones"), (req, res) => {
  db.query(
    "DELETE FROM notificaciones WHERE email = ?",
    [req.body.email],
    (err) => res.json({ status: "ok" }),
  );
});

// Listar correos de nómina
app.get("/api/admin/emails-nomina", verificarSuperAdmin, (req, res) => {
  db.query("SELECT email FROM notificaciones_nomina", (err, results) => {
    if (err) return res.status(500).json([]);
    res.json(results.map((r) => r.email));
  });
});

// Agregar correo de nómina
app.post("/api/admin/emails-nomina", verificarSuperAdmin, registrarActividad("Agregar correo nómina"), (req, res) => {
  const { email } = req.body;
  db.query(
    "INSERT INTO notificaciones_nomina (email) VALUES (?)",
    [email],
    (err) => {
      if (err)
        return res.status(500).json({
          status: "error",
          message: "El correo ya existe o hubo un error.",
        });
      res.json({ status: "ok" });
    },
  );
});

// Eliminar correo de nómina
// Agrega esto en tu archivo de rutas de Node.js
app.delete("/api/admin/emails-nomina", verificarSuperAdmin, registrarActividad("Eliminar correo nómina"), (req, res) => {
  const { email } = req.body; // Extraemos el email del cuerpo de la petición

  if (!email) {
    return res
      .status(400)
      .json({ status: "error", message: "Email requerido" });
  }

  db.query(
    "DELETE FROM notificaciones_nomina WHERE email = ?",
    [email],
    (err, result) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ status: "error", message: "Error al eliminar" });
      }

      res.json({ status: "ok", message: "Correo eliminado correctamente" });
    },
  );
});

const cors = require("cors");

app.use(
  cors({
    origin: "*", // O tu dominio específico
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // <--- ESTO ES CLAVE: Caché del permiso por 24 horas
  }),
);
app.get("/time-colombia", (req, res) => {
  try {
    const ahora = new Date();

    // Formato para mostrar (puedes ajustar el nombre si tu frontend busca 'fecha_hora')
    const fechaColombiaStr = ahora.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      hour12: false,
    });

    res.json({
      // Enviamos el objeto Date real para que Ionic no falle al procesarlo
      datetime: ahora.toISOString(),
      formatted: fechaColombiaStr,
      // Agregamos este campo por si tu frontend lo busca con este nombre
      fecha_hora: ahora.toISOString(),
      status: "ok",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// // Justo después de que el servidor arranca:
// io.on("connection", (socket) => {
//   // Cuando alguien se conecta, le enviamos la versión actual una sola vez
//   socket.emit("version-actual", Date.now().toString());
// });
// ==========================================
// 7. INICIAR SERVIDOR
// ==========================================
server.listen(PORT, () => {
    console.log(`--- DEBUG ---`);
    console.log(`🚀 Servidor y WebSockets: http://localhost:${PORT}`);
    console.log(`🆔 Version ID actual: ${serverID}`);
    console.log(`-------------`);
});