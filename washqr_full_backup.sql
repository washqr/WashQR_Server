PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    pin TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  , role TEXT NOT NULL DEFAULT 'user', one_time_pin TEXT, one_time_pin_used INTEGER NOT NULL DEFAULT 0);
INSERT INTO users VALUES(1,'????','0999000000','1234',0,0,'2026-08-08 06:44:34','user',NULL,0);
INSERT INTO users VALUES(2,'Али','0228005110','1234',0,10,'2026-08-08 10:59:59','admin',NULL,0);
CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        post INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
    );
INSERT INTO payments VALUES('PAY-1787824915151-589',1,50.0,'paid','2026-08-27T10:01:55.151Z');
CREATE TABLE esp32_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post INTEGER NOT NULL,
        coins INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
    );
INSERT INTO esp32_commands VALUES(1,1,20,'sent','2026-08-21T18:30:09.929Z');
INSERT INTO esp32_commands VALUES(2,1,20,'sent','2026-08-21T18:55:42.375Z');
INSERT INTO esp32_commands VALUES(3,1,5,'sent','2026-08-27T10:04:57.587Z');
PRAGMA writable_schema=ON;
CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq);
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence VALUES('users',2);
INSERT INTO sqlite_sequence VALUES('esp32_commands',3);
PRAGMA writable_schema=OFF;
COMMIT;
