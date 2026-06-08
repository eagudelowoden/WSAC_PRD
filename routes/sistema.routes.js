const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../databases/db");
const { verificarAuth, DEFAULTS_MODULOS_POR_ROL } = require("../middlewares/auth");

// ==========================================
// LOGIN
// ==========================================
router.post("/login", (req, res) => {
  const ticketAcceso = require("crypto").randomBytes(16).toString("hex");
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
          // Los usuarios con rol "jefe" se redirigen al portal automáticamente
          if (user.rol === "jefe") {
            const tokenPayload = { id: user.id, nombre: user.nombre, rol: user.rol };
            req.session.usuario = tokenPayload;
            req.session.tokenSeguridad = "WSAC_SECURE_" + Date.now();
            req.session.lastActivity = Date.now();
            return req.session.save(() => {
              res.json({ status: "ok", message: "Bienvenido", redirect: "/portal/inicio" });
            });
          }

          const tokenPayload = {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
          };

          req.session.usuario = tokenPayload;
          req.session.tokenSeguridad = "WSAC_SECURE_" + Date.now();
          req.session.lastActivity = Date.now();

          const token = jwt.sign(
            tokenPayload,
            process.env.JWT_SECRET || "Secret_WAS_Key_123",
            { expiresIn: "8h" },
          );

          // Si venía de un redirect (ej: /login.html?redirect=/portal/inicio), usarlo
          const redirectParam = req.body.redirect || req.query.redirect || null;

          let redirectUrl = "/panel-administrativo";
          if (user.rol === "superadmin")        redirectUrl = "/superadmin";
          else if (user.rol === "aprobadorDos") redirectUrl = "/panel-aprobacionesDos";
          else if (user.rol === "jefe")         redirectUrl = "/portal/inicio";

          // Solo usar el redirect externo si es una ruta interna segura
          if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
            redirectUrl = redirectParam;
          }

          req.session.save((err) => {
            if (err)
              return res
                .status(500)
                .json({ status: "error", message: "Error al crear sesión" });

            return res.json({
              status: "ok",
              message: "Bienvenido",
              token,
              usuario: tokenPayload,
              redirect: `${redirectUrl}?s=${ticketAcceso}`,
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

// ==========================================
// LOGOUT
// ==========================================
router.post("/logout", (req, res) => {
  if (req.logout) req.logout(() => {});

  req.session.destroy((err) => {
    if (err) {
      console.error("Error al destruir la sesión:", err);
      return res
        .status(500)
        .json({ status: "error", message: "Error al cerrar sesión" });
    }

    res.clearCookie("session_cookie_name", { path: "/", httpOnly: true });
    res.status(200).json({
      status: "ok",
      message: "Sesión eliminada en servidor y cookie limpiada",
    });
  });
});

// ==========================================
// CHECK VERSION (Polling)
// ==========================================
router.get("/check-version", (req, res) => {
  console.log("🔍 Petición de chequeo de versión recibida");
  // serverID viene del app principal — lo inyectamos como app.locals
  res.json({ version: req.app.locals.serverID });
});

// ==========================================
// MANTENIMIENTO
// ==========================================
router.get("/check-mantenimiento", (req, res) => {
  const query =
    "SELECT activo, mensaje, DATE_FORMAT(fecha, '%Y-%m-%d') as fecha FROM mantenimiento WHERE id = 1";

  db.query(query, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.length > 0) res.json(result[0]);
    else res.json({ activo: false, mensaje: "", fecha: "" });
  });
});

router.post("/update-mantenimiento", (req, res) => {
  const { activo, mensaje, fecha } = req.body;
  const query =
    "UPDATE mantenimiento SET activo = ?, mensaje = ?, fecha = ? WHERE id = 1";

  db.query(query, [activo, mensaje, fecha], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    const datosAviso = { activo, mensaje, fecha };
    const socketInstance = global.io;

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

// ==========================================
// MÓDULOS PERMITIDOS DEL USUARIO ACTUAL
// ==========================================
router.get("/mis-modulos", verificarAuth, (req, res) => {
  const { rol, id } = req.session.usuario;

  if (rol === "superadmin") {
    return res.json({
      modulo_seleccion    : true,
      modulo_nomina       : true,
      modulo_postulaciones: true,
      modulo_requisiciones: true,
    });
  }

  const modulos = {
    modulo_seleccion    : false,
    modulo_nomina       : false,
    modulo_postulaciones: false,
    modulo_requisiciones: false,
    ...(DEFAULTS_MODULOS_POR_ROL[rol] || {}),
  };

  db.query(
    "SELECT seccion, puede_editar FROM permisos_edicion WHERE usuario_id = ? AND seccion LIKE 'modulo_%'",
    [id],
    (err, results) => {
      if (!err && results) {
        results.forEach((r) => {
          modulos[r.seccion] = r.puede_editar === 1;
        });
      }
      res.json(modulos);
    },
  );
});

// ==========================================
// HORA COLOMBIA
// ==========================================
router.get("/time-colombia", (req, res) => {
  try {
    const ahora = new Date();
    const fechaColombiaStr = ahora.toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      hour12: false,
    });

    res.json({
      datetime: ahora.toISOString(),
      formatted: fechaColombiaStr,
      fecha_hora: ahora.toISOString(),
      status: "ok",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

module.exports = router;
