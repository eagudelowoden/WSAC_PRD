// Archivo: database.js
const mysql = require("mysql2");
const bcrypt = require('bcrypt');

// ====================================================
// 1. CONFIGURACIÓN DEL POOL (OPTIMIZADO)
// ====================================================
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1', // Usa IP, no localhost
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true, // <--- Mantiene la conexión viva
    keepAliveInitialDelay: 0
});

// Probamos la conexión inicial (solo para ver el log y crear tablas)
pool.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Error conectando a MySQL:", err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('La conexión con la base de datos fue cerrada.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('La base de datos tiene muchas conexiones.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('La conexión fue rechazada.');
        }
        return;
    }

    console.log("✅ Conexión Pool establecida exitosamente (MySQL).");

    // ====================================================
    // 2. CREAR TABLA DE USUARIOS (SI NO EXISTE)
    // ====================================================
    const tablaUsuarios = `
        CREATE TABLE IF NOT EXISTS usuariosSys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100),
            usuario VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            rol VARCHAR(20) NOT NULL
        )
    `;

    // Usamos la 'connection' que obtuvimos para inicializar
    connection.query(tablaUsuarios, (err) => {
        if (err) console.log("Error creando tabla usuariosSys:", err);
        else {
            // ====================================================
            // 3. CREAR SUPER ADMIN AUTOMÁTICO
            // ====================================================
            connection.query("SELECT * FROM usuariosSys WHERE usuario = 'superadmin'", (err, results) => {
                if (!err && results.length === 0) {
                    const passPlano = 'admin123';
                    bcrypt.hash(passPlano, 10, (err, hash) => {
                        if (err) { console.log("Error encriptando:", err); return; }

                        const sqlInsert = "INSERT INTO usuariosSys (nombre, usuario, password, rol) VALUES (?, ?, ?, ?)";
                        connection.query(sqlInsert, ['Super Administrador', 'superadmin', hash, 'superadmin'], (err) => {
                            if (!err) console.log("👤 Usuario 'superadmin' creado por defecto.");
                            else console.log("Error insertando admin:", err);
                        });
                    });
                }
            });
        }
    });

    // ====================================================
    // 4. CREAR TABLA DE NOTIFICACIONES
    // ====================================================
    const tablaNotif = `
        CREATE TABLE IF NOT EXISTS notificaciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100) UNIQUE NOT NULL
        )
    `;
    connection.query(tablaNotif, (err) => {
        if (err) console.log("Error creando tabla notificaciones:", err);
    });

    // MUY IMPORTANTE: Liberar la conexión al terminar la inicialización
    connection.release();
});

// Exportamos el pool directamente. 
// Nota: pool.query funciona igual que connection.query, no necesitas cambiar tu código en las rutas.
module.exports = pool;