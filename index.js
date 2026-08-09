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

        console.log("Вход выполнен:", user);

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

        console.error("Ошибка проверки платежа:", error);

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});


// ========================================
// ТЕСТОВОЕ ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА
// ВРЕМЕННО — ДЛЯ ПРОВЕРКИ
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

// ========================================
// ТЕСТОВОЕ ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА
// ========================================

app.get("/test-pay/:paymentId", (req, res) => {
    const { paymentId } = req.params;

    db.run(
        `
        UPDATE payments
        SET status = 'paid'
        WHERE id = ?
        `,
        [paymentId],
        function (err) {
            if (err) {
                console.error("Ошибка подтверждения платежа:", err);

                return res.status(500).json({
                    success: false,
                    message: "Ошибка сервера"
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Платёж не найден"
                });
            }

            console.log("Платёж подтверждён:", paymentId);

            res.json({
                success: true,
                message: "Платёж подтверждён",
                paymentId: paymentId,
                status: "paid"
            });
        }
    );
});
app.listen(PORT, "0.0.0.0", () => {

    console.log("=================================");
    console.log("База WashQR готова.");
    console.log("WashQR Server запущен");
    console.log("Порт:", PORT);
    console.log("=================================");

});