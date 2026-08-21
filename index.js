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
// РЕГИСТРАЦИЯ
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
// ВХОД
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
                bonus
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
            SELECT id, name, bonus
            FROM users
            WHERE id = ?
        `).get(userId);

        console.log(
            `Тестовое пополнение: пользователь ${userId}, +${amount} сом`
        );

        res.json({
            success: true,
            message: "Бонусы пополнены",
            user: user
        });

    } catch (error) {
        console.error("Ошибка тестового пополнения:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// ========================================
// ОПЛАТА БОНУСАМИ
// ========================================
// Бонусы списываются.
// После успешного списания создаётся
// команда для ESP32.
//
// 1 сом = 1 импульс
// ========================================

app.post("/pay-bonus", (req, res) => {

    const { userId, post, amount } = req.body;

    if (!userId || !post || !amount) {
        return res.status(400).json({
            success: false,
            message: "Не указан пользователь, пост или сумма"
        });
    }

    const numericUserId = Number(userId);
    const numericPost = Number(post);
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
            success: false,
            message: "Некорректная сумма"
        });
    }

    if (numericPost !== 1 && numericPost !== 2) {
        return res.status(400).json({
            success: false,
            message: "Некорректный номер поста"
        });
    }

    if (!Number.isInteger(Math.round(numericAmount))) {
        return res.status(400).json({
            success: false,
            message: "Сумма должна быть целым числом"
        });
    }

    try {

        const payment = db.transaction(() => {

            // Находим пользователя
            const user = db.prepare(`
                SELECT
                    id,
                    name,
                    bonus
                FROM users
                WHERE id = ?
            `).get(numericUserId);

            if (!user) {
                throw new Error("Пользователь не найден");
            }

            // Проверяем бонусы
            if (Number(user.bonus) < numericAmount) {
                throw new Error("Недостаточно бонусов");
            }

            // Списываем бонусы
            const update = db.prepare(`
                UPDATE users
                SET bonus = bonus - ?
                WHERE id = ?
            `).run(
                numericAmount,
                numericUserId
            );

            if (update.changes !== 1) {
                throw new Error("Не удалось списать бонусы");
            }

            // Количество импульсов
            const coins = Math.round(numericAmount);

            // Создаём команду для ESP32
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
                numericPost,
                coins,
                new Date().toISOString()
            );

            console.log("=================================");
            console.log("ОПЛАТА БОНУСАМИ");
            console.log("Пользователь:", numericUserId);
            console.log("Пост:", numericPost);
            console.log("Сумма:", numericAmount);
            console.log("Импульсы:", coins);
            console.log("Команда ID:", command.lastInsertRowid);
            console.log("=================================");

            const updatedUser = db.prepare(`
                SELECT
                    id,
                    name,
                    bonus
                FROM users
                WHERE id = ?
            `).get(numericUserId);

            return {
                user: updatedUser,
                commandId: command.lastInsertRowid,
                coins: coins
            };
        })();

        res.json({
            success: true,
            message: "Оплата бонусами выполнена",
            userId: numericUserId,
            post: numericPost,
            amount: numericAmount,
            coins: payment.coins,
            commandId: payment.commandId,
            user: payment.user
        });

    } catch (error) {

        console.error("Ошибка оплаты бонусами:", error);

        if (error.message === "Пользователь не найден") {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.message === "Недостаточно бонусов") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

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
// ESP32:
// GET /esp32/command?post=1
//
// Если команда есть — отдаём её
// и сразу помечаем как sent.
//
// Если команды нет:
// command = null
// ========================================

app.get("/esp32/command", (req, res) => {

    const post = Number(req.query.post);

    if (post !== 1 && post !== 2) {
        return res.status(400).json({
            success: false,
            message: "Некорректный номер поста"
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

        // Помечаем команду полученной
        db.prepare(`
            UPDATE esp32_commands
            SET status = 'sent'
            WHERE id = ?
        `).run(command.id);

        console.log("=================================");
        console.log("КОМАНДА ESP32 ВЫДАНА");
        console.log("ID:", command.id);
        console.log("Пост:", command.post);
        console.log("Импульсы:", command.coins);
        console.log("=================================");

        res.json({
            success: true,
            command: {
                id: command.id,
                post: command.post,
                coins: command.coins
            }
        });

    } catch (error) {

        console.error("Ошибка команды ESP32:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// ========================================
// СОЗДАНИЕ QR-ПЛАТЕЖА
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

        console.log("Платёж создан:", payment);

        res.json({
            success: true,
            payment: payment
        });

    } catch (error) {

        console.error("Ошибка создания платежа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка создания платежа"
        });
    }
});


// ========================================
// СТАТУС ПЛАТЕЖА
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

        console.error("Ошибка проверки платежа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// ========================================
// ТЕСТОВОЕ ПОДТВЕРЖДЕНИЕ QR-ПЛАТЕЖА
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

        console.log("Платёж подтверждён:", payment);

        res.json({
            success: true,
            message: "Платёж успешно подтверждён",
            payment: payment
        });

    } catch (error) {

        console.error("Ошибка подтверждения платежа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// ========================================
// СПИСОК ПЛАТЕЖЕЙ
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

        console.error("Ошибка получения платежей:", error);

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

        res.send(`
            <h2>✅ Платёж подтверждён</h2>
            <p>ID: ${paymentId}</p>
            <p>Теперь приложение должно показать: Платёж подтверждён</p>
        `);

    } catch (error) {

        console.error(error);

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