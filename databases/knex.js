/**
 * databases/knex.js
 * Query builder — reemplaza los db.query() manuales.
 * Usa el mismo mysql2 ya instalado, sin pool duplicado relevante.
 */
require("dotenv").config();

const knex = require("knex")({
  client: "mysql2",
  connection: {
    host    : process.env.DB_HOST || "127.0.0.1",
    user    : process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate(conn, done) {
      conn.query("SET time_zone = '-05:00'", done); // Hora Colombia
    },
  },
  acquireConnectionTimeout: 10_000,
});

module.exports = knex;
