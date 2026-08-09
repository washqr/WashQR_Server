const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

// ========================================
// ПРОВЕРКА СЕРВЕРА
// ========================================

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>WashQR</title>

    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f2f5f8;
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
            box-shadow: 0 5px 25px rgba(0,0,0,0.1);
        }

        h1 {
            font-size: 32px;
            margin-bottom: 10px;
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

    console.log("Регистрация пользователя:");
    console.log("Имя:", name);
    console.log("Телефон:", phone);

    if (!name || !phone || !pin) {
        return res.status(400).json({
            success: false,
            message: "Заполните имя, телефон и PIN-код"
        });
    }

    if (pin.length !== 4) {
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
            pin
        );

        const user = db.prepare(
            "SELECT id, name, phone, balance, bonus FROM users WHERE id = ?"
        ).get(result.lastInsertRowid);

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

    console.log("Попытка входа:");
    console.log("Телефон:", phone);

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

        if (!user) {
            console.log("Пользователь не найден");

            return res.status(401).json({
                success: false,
                message: "Неверный номер телефона или PIN-код"
            });
        }

        if (user.pin !== pin) {
            console.log("Неверный PIN-код");

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

    console.log("Создание платежа:");
    console.log("Пост:", post);
    console.log("Сумма:", amount);

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

    const payment = {
        id: paymentId,
        post: post,
        amount: amount,
        status: "pending",
        createdAt: new Date().toISOString()
    };

    console.log("Платёж создан:");
    console.log(payment);

    res.json({
        success: true,
        payment: payment
    });
});

// ========================================
// ЗАПУСК СЕРВЕРА
// ========================================

const PORT = 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("База WashQR готова.");
    console.log("WashQR Server запущен");
    console.log("Порт:", PORT);
    console.log("=================================");
});