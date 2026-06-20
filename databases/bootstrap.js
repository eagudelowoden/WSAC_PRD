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

    console.log("✅ Conexión a MySQL (knex) establecida exitosamente.");
  } catch (err) {
    console.error("❌ Error inicializando BD:", err.message);
  }
}

bootstrap();

module.exports = bootstrap;
