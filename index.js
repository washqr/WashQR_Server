const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

// ========================================
// ГЛАВНАЯ СТРАНИЦА
// ========================================

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>WashQR Server</title>

            <style>
                body {
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background: #0D47A1;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }

                .box {
                    background: white;
                    width: 90%;
                    max-width: 420px;
                    padding: 30px;
                    border-radius: 20px;
                    text-align: center;
                    box-shadow: 0 5px 25px rgba(0,0,0,0.25);
                }

                h1 {
                    color: #0D47A1;
                    font-size: 32px;
                }

                p {
                    color: #666;
                    font-size: 18px;
                }

                .status {
                    margin-top: 25px;
                    padding: 15px;
                    border-radius: 12px;
                    background: #e8f5e9;
                    color: #2e7d32;
                    font-weight: bold;
                }
            </style>
        </head>

        <body>
            <div class="box">
                <h1>🚗 WashQR</h1>
                <p>QR-оплата автомойки</p>

                <div class="status">
                    ✅ Сервер работает
                </div>
            </div>
        </body>
        </html>
    `);
});

// ========================================
// РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ
// ========================================

app.post("/register", (req, res) => {

    const { name, phone, pin } = req.body;

    if (!name || !phone || !pin) {
        return res.status(400).json({
            success: false,
            message: "Заполните имя, телефон и PIN-код"
        });
    }

    if (String(pin).length !== 4) {
        return res.status(400).json({
            success: false,
            message: "PIN-код должен содержать 4 цифры"
        });
    }

    try {

        const existingUser = db.prepare(
            "SELECT id FROM users WHERE phone = ?"
        ).get(phone);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Пользователь с таким номером уже существует"
            });
        }

        const result = db.prepare(`
            INSERT INTO users
            (name, phone, pin, balance, bonus)
            VALUES (?, ?, ?, 0, 0)
        `).run(
            name,
            phone,
            String(pin)
        );

        const user = db.prepare(`
            SELECT
                id,
                name,
                phone,
                balance,
                bonus
            FROM users
            WHERE id = ?
        `).get(result.lastInsertRowid);

        console.log("Пользователь зарегистрирован:", user);

        res.json({
            success: true,
            message: "Регистрация выполнена",
            user: user
        });

    } catch (error) {

        console.error("Ошибка регистрации:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ВХОД В АККАУНТ
// ========================================

app.post("/login", (req, res) => {

    const { phone, pin } = req.body;

    if (!phone || !pin) {
        return res.status(400).json({
            success: false,
            message: "Введите номер телефона и PIN-код"
        });
    }

    try {

        const user = db.prepare(`
            SELECT
                id,
                name,
                phone,
                pin,
                balance,
                bonus,
                role
            FROM users
            WHERE phone = ?
        `).get(phone);

        if (!user || user.pin !== String(pin)) {
            return res.status(401).json({
                success: false,
                message: "Неверный номер телефона или PIN-код"
            });
        }

        delete user.pin;

        console.log(
            `Вход выполнен: пользователь ${user.id}, роль ${user.role}`
        );

        res.json({
            success: true,
            message: "Вход выполнен",
            user: user
        });

    } catch (error) {

        console.error("Ошибка входа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ТЕСТОВОЕ ПОПОЛНЕНИЕ БОНУСОВ
// ВРЕМЕННО
// ========================================

app.post("/test-bonus/:userId", (req, res) => {

    const { userId } = req.params;
    const amount = 50;

    try {

        const result = db.prepare(`
            UPDATE users
            SET bonus = bonus + ?
            WHERE id = ?
        `).run(amount, userId);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        const user = db.prepare(`
            SELECT
                id,
                name,
                bonus
            FROM users
            WHERE id = ?
        `).get(userId);

        console.log(
            `Тестовое пополнение бонусов: пользователь ${userId}, +${amount} сом`
        );

        res.json({
            success: true,
            message: "Бонусы пополнены",
            user: user
        });

    } catch (error) {

        console.error(
            "Ошибка тестового пополнения:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ОПЛАТА БОНУСАМИ
// ========================================
//
// Сейчас тестируем:
// 20 сом = 2 импульса
//
// Формула:
// 10 сом = 1 импульс
//
// Поэтому:
// 20 сом = 2 импульса
// 50 сом = 5 импульсов
// 100 сом = 10 импульсов
//
// ========================================

app.post("/pay-bonus", (req, res) => {

    const { userId, post, amount } = req.body;

    if (!userId || !post || !amount) {
        return res.status(400).json({
            success: false,
            message: "Не указан пользователь, пост или сумма"
        });
    }

    try {

        const user = db.prepare(`
            SELECT
                id,
                name,
                bonus
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        if (user.bonus < amount) {
            return res.status(400).json({
                success: false,
                message: "Недостаточно бонусов"
            });
        }

        // ========================================
        // РАССЧИТЫВАЕМ ИМПУЛЬСЫ
        // ========================================

        const coins = Math.floor(Number(amount) / 10);

        if (coins < 1) {
            return res.status(400).json({
                success: false,
                message: "Сумма слишком маленькая для импульса"
            });
        }

        // ========================================
        // СПИСЫВАЕМ БОНУСЫ
        // ========================================

        db.prepare(`
            UPDATE users
            SET bonus = bonus - ?
            WHERE id = ?
        `).run(
            amount,
            userId
        );

        // ========================================
        // СОЗДАЁМ КОМАНДУ ДЛЯ ESP32
        // ========================================

        const createdAt = new Date().toISOString();

        const command = db.prepare(`
            INSERT INTO esp32_commands
            (
                post,
                coins,
                status,
                created_at
            )
            VALUES (?, ?, 'pending', ?)
        `).run(
            post,
            coins,
            createdAt
        );

        const commandId = Number(command.lastInsertRowid);

        console.log(
            `Оплата бонусами: пользователь ${userId}, пост ${post}, сумма ${amount}, импульсов ${coins}, команда ${commandId}`
        );

        // ========================================
        // ОТВЕТ
        // ========================================

        res.json({
            success: true,
            message: "Оплата бонусами выполнена",
            userId: userId,
            post: post,
            amount: amount,
            coins: coins,
            commandId: commandId
        });

    } catch (error) {

        console.error(
            "Ошибка оплаты бонусами:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// СОЗДАНИЕ ПЛАТЕЖА
// ========================================

app.post("/create-payment", (req, res) => {

    const { post, amount } = req.body;

    if (!post || !amount) {
        return res.status(400).json({
            success: false,
            message: "Не указан пост или сумма"
        });
    }

    const paymentId =
        "PAY-" +
        Date.now() +
        "-" +
        Math.floor(Math.random() * 1000);

    const createdAt = new Date().toISOString();

    try {

        db.prepare(`
            INSERT INTO payments
            (
                id,
                post,
                amount,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            paymentId,
            post,
            amount,
            "pending",
            createdAt
        );

        const payment = db.prepare(`
            SELECT
                id,
                post,
                amount,
                status,
                created_at
            FROM payments
            WHERE id = ?
        `).get(paymentId);

        console.log(
            "Платёж создан:",
            payment
        );

        res.json({
            success: true,
            payment: payment
        });

    } catch (error) {

        console.error(
            "Ошибка создания платежа:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка создания платежа"
        });
    }
});

// ========================================
// ПРОВЕРКА СТАТУСА ПЛАТЕЖА
// ========================================

app.get("/payment-status/:paymentId", (req, res) => {

    const { paymentId } = req.params;

    try {

        const payment = db.prepare(`
            SELECT
                id,
                post,
                amount,
                status,
                created_at
            FROM payments
            WHERE id = ?
        `).get(paymentId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Платёж не найден"
            });
        }

        res.json({
            success: true,
            paymentId: payment.id,
            status: payment.status,
            post: payment.post,
            amount: payment.amount
        });

    } catch (error) {

        console.error(
            "Ошибка проверки платежа:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ТЕСТОВОЕ ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА
// ВРЕМЕННО
// ========================================

app.post("/test-pay/:paymentId", (req, res) => {

    const { paymentId } = req.params;

    try {

        const result = db.prepare(`
            UPDATE payments
            SET status = 'paid'
            WHERE id = ?
        `).run(paymentId);

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Платёж не найден"
            });
        }

        const payment = db.prepare(`
            SELECT *
            FROM payments
            WHERE id = ?
        `).get(paymentId);

        // ========================================
        // СОЗДАЁМ КОМАНДУ ESP32
        // ========================================

        const coins = Math.floor(
            Number(payment.amount) / 10
        );

        const createdAt = new Date().toISOString();

        const command = db.prepare(`
            INSERT INTO esp32_commands
            (
                post,
                coins,
                status,
                created_at
            )
            VALUES (?, ?, 'pending', ?)
        `).run(
            payment.post,
            coins,
            createdAt
        );

        const commandId = Number(
            command.lastInsertRowid
        );

        console.log(
            `Платёж подтверждён: ${paymentId}, пост ${payment.post}, сумма ${payment.amount}, импульсов ${coins}, команда ${commandId}`
        );

        res.json({
            success: true,
            message: "Платёж успешно подтверждён",
            payment: payment,
            coins: coins,
            commandId: commandId
        });

    } catch (error) {

        console.error(
            "Ошибка подтверждения платежа:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ESP32 ПОЛУЧАЕТ КОМАНДУ
// ========================================
//
// ESP32 обращается:
//
// /esp32/command?post=1
//
// Сервер отдаёт первую pending-команду
// для указанного поста.
//
// После выдачи команда становится sent,
// чтобы ESP32 не получил её повторно.
// ========================================

app.get("/esp32/command", (req, res) => {

    const post = Number(req.query.post);

    if (!post) {
        return res.status(400).json({
            success: false,
            message: "Не указан номер поста"
        });
    }

    try {

        const command = db.prepare(`
            SELECT
                id,
                post,
                coins,
                status,
                created_at
            FROM esp32_commands
            WHERE post = ?
              AND status = 'pending'
            ORDER BY id ASC
            LIMIT 1
        `).get(post);

        if (!command) {

            return res.json({
                success: true,
                command: null
            });
        }

        // ========================================
        // ПОМЕЧАЕМ КОМАНДУ КАК ОТПРАВЛЕННУЮ
        // ========================================

        db.prepare(`
            UPDATE esp32_commands
            SET status = 'sent'
            WHERE id = ?
        `).run(command.id);

        console.log(
            `ESP32 получил команду: ID ${command.id}, пост ${command.post}, импульсов ${command.coins}`
        );

        res.json({
            success: true,
            command: {
                id: command.id,
                post: command.post,
                coins: command.coins
            }
        });

    } catch (error) {

        console.error(
            "Ошибка выдачи команды ESP32:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// СПИСОК ВСЕХ ПЛАТЕЖЕЙ
// ТЕСТОВЫЙ МАРШРУТ
// ========================================

app.get("/payments", (req, res) => {

    try {

        const payments = db.prepare(`
            SELECT *
            FROM payments
            ORDER BY created_at DESC
        `).all();

        res.json({
            success: true,
            payments: payments
        });

    } catch (error) {

        console.error(
            "Ошибка получения платежей:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// СПИСОК КОМАНД ESP32
// ТЕСТОВЫЙ МАРШРУТ
// ========================================

app.get("/esp32/commands", (req, res) => {

    try {

        const commands = db.prepare(`
            SELECT *
            FROM esp32_commands
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            commands: commands
        });

    } catch (error) {

        console.error(
            "Ошибка получения команд ESP32:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ТЕСТОВОЕ ПОДТВЕРЖДЕНИЕ ЧЕРЕЗ БРАУЗЕР
// ========================================

app.get("/test-pay/:paymentId", (req, res) => {

    const { paymentId } = req.params;

    try {

        const result = db.prepare(`
            UPDATE payments
            SET status = 'paid'
            WHERE id = ?
        `).run(paymentId);

        if (result.changes === 0) {
            return res.status(404).send(`
                <h2>Платёж не найден</h2>
                <p>${paymentId}</p>
            `);
        }

        const payment = db.prepare(`
            SELECT *
            FROM payments
            WHERE id = ?
        `).get(paymentId);

        // ========================================
        // СОЗДАЁМ КОМАНДУ ESP32
        // ========================================

        const coins = Math.floor(
            Number(payment.amount) / 10
        );

        const createdAt = new Date().toISOString();

        const command = db.prepare(`
            INSERT INTO esp32_commands
            (
                post,
                coins,
                status,
                created_at
            )
            VALUES (?, ?, 'pending', ?)
        `).run(
            payment.post,
            coins,
            createdAt
        );

        const commandId = Number(
            command.lastInsertRowid
        );

        console.log(
            `Платёж подтверждён через браузер: ${paymentId}, импульсов ${coins}, команда ${commandId}`
        );

        res.send(`
            <h2>✅ Платёж подтверждён</h2>
            <p>ID: ${paymentId}</p>
            <p>Сумма: ${payment.amount} сом</p>
            <p>Импульсов ESP32: ${coins}</p>
            <p>ID команды: ${commandId}</p>
            <p>ESP32 может получить команду.</p>
        `);

    } catch (error) {

        console.error(
            "Ошибка подтверждения через браузер:",
            error
        );

        res.status(500).send(`
            <h2>Ошибка сервера</h2>
        `);
    }
});

// ========================================
// ЗАПУСК СЕРВЕРА
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

    console.log("=================================");
    console.log("База WashQR готова.");
    console.log("WashQR Server запущен");
    console.log("Порт:", PORT);
    console.log("=================================");
});