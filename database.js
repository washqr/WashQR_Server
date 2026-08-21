const Database = require("better-sqlite3");
const path = require("path");

// ========================================
// ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
// ========================================

const dbPath = path.join(__dirname, "washqr.db");

const db = new Database(dbPath);

console.log("База данных подключена");

// ========================================
// ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
// ========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        balance REAL DEFAULT 0,
        bonus REAL DEFAULT 0
    )
`).run();

// ========================================
// ТАБЛИЦА ПЛАТЕЖЕЙ
// ========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        post INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
    )
`).run();

// ========================================
// КОМАНДЫ ДЛЯ ESP32
// ========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS esp32_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post INTEGER NOT NULL,
        coins INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
    )
`).run();

console.log("Таблицы users, payments и esp32_commands готовы");

module.exports = db;