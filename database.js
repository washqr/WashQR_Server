const Database = require("better-sqlite3");

const db = new Database("washqr.db");

// Таблица клиентов
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

console.log("База WashQR готова.");

module.exports = db;