/**
 * databases/bootstrap.js
 * Crea las tablas base y el superadmin por defecto si no existen.
 * Se ejecuta una sola vez al arrancar la app (ver app.js).
 */
const bcrypt = require("bcrypt");
const db = require("./knex");

async function bootstrap() {
  try {
    await db.raw(`
      CREATE TABLE IF NOT EXISTS usuariosSys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(100),
        usuario VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL
      )
    `);

    const [existentes] = await db.raw(
      "SELECT * FROM usuariosSys WHERE usuario = 'superadmin'",
    );
    if (existentes.length === 0) {
      const hash = await bcrypt.hash("admin123", 10);
      await db.raw(
        "INSERT INTO usuariosSys (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)",
        ["Super Administrador", "superadmin", hash, "superadmin"],
      );
      console.log("👤 Usuario 'superadmin' creado por defecto.");
    }

    await db.raw(`
      CREATE TABLE IF NOT EXISTS notificaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    await db.raw(`
      CREATE TABLE IF NOT EXISTS permisos_edicion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        seccion VARCHAR(100) NOT NULL,
        puede_editar TINYINT(1) DEFAULT 0,
        UNIQUE KEY unique_usuario_seccion (usuario_id, seccion)
      )
    `);
    console.log("✅ Tabla permisos_edicion verificada.");

    await db.raw(`
      CREATE TABLE IF NOT EXISTS logs_seguridad (
        id INT AUTO_INCREMENT PRIMARY KEY,
        evento VARCHAR(30) NOT NULL,
        usuario_intentado VARCHAR(100),
        ip VARCHAR(64),
        user_agent VARCHAR(255),
        motivo VARCHAR(150),
        sospechoso_sqli TINYINT(1) DEFAULT 0,
        payload_sospechoso VARCHAR(500),
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_creado_en (creado_en),
        INDEX idx_evento (evento)
      )
    `);
    console.log("✅ Tabla logs_seguridad verificada.");

    const [colActivo] = await db.raw("SHOW COLUMNS FROM usuarios LIKE 'activo'");
    if (colActivo.length === 0) {
      await db.raw(
        "ALTER TABLE usuarios ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1",
      );
      console.log("✅ Columna 'activo' agregada a usuarios.");
    }

    console.log("✅ Conexión a MySQL (knex) establecida exitosamente.");
  } catch (err) {
    console.error("❌ Error inicializando BD:", err.message);
  }
}

bootstrap();

module.exports = bootstrap;
