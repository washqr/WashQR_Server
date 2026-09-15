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
        bonus REAL DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'user',
        one_time_pin TEXT,
        one_time_pin_used INTEGER NOT NULL DEFAULT 0
    )
`).run();

// ========================================
// ДОБАВЛЯЕМ ROLE В СТАРУЮ БАЗУ
// ========================================

try {
    db.prepare(`
        ALTER TABLE users
        ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    `).run();

    console.log("Поле role добавлено в таблицу users");
} catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
        throw error;
    }
}

// ========================================
// ДОБАВЛЯЕМ ONE_TIME_PIN В СТАРУЮ БАЗУ
// ========================================

try {
    db.prepare(`
        ALTER TABLE users
        ADD COLUMN one_time_pin TEXT
    `).run();

    console.log("Поле one_time_pin добавлено");
} catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
        throw error;
    }
}

// ========================================
// ДОБАВЛЯЕМ ONE_TIME_PIN_USED В СТАРУЮ БАЗУ
// ========================================

try {
    db.prepare(`
        ALTER TABLE users
        ADD COLUMN one_time_pin_used INTEGER NOT NULL DEFAULT 0
    `).run();

    console.log("Поле one_time_pin_used добавлено");
} catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
        throw error;
    }
}

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
// ИСТОРИЯ ОПЛАТ БОНУСАМИ
// ========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS bonus_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        user_phone TEXT NOT NULL,
        post INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        coins INTEGER NOT NULL,
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

// ========================================
// СТАТИЧЕСКИЕ QR MKASSA
// ========================================

db.prepare(`
    CREATE TABLE IF NOT EXISTS static_qr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qr_id TEXT NOT NULL UNIQUE,
        amount INTEGER NOT NULL,
        post INTEGER NOT NULL,
        mkassa_id TEXT,
        static_qr_link TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
`).run();

console.log(
    "Таблицы users, payments и esp32_commands готовы"
);

module.exports = db;