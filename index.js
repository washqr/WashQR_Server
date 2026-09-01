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

    if (!/^\d{4}$/.test(String(pin))) {
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
            (
                name,
                phone,
                pin,
                balance,
                bonus,
                role,
                one_time_pin,
                one_time_pin_used
            )
            VALUES (?, ?, ?, 0, 0, 'user', NULL, 0)
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
        bonus
    FROM users
    WHERE id = ?
`).get(userId);

        console.log(
            "Пользователь зарегистрирован:",
            user
        );

        res.json({
            success: true,
            message: "Регистрация выполнена",
            user: user
        });

    } catch (error) {

        console.error(
            "Ошибка регистрации:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ВХОД В АККАУНТ
// ========================================
//
// Обычный вход:
// phone + постоянный PIN
//
// Вход после восстановления:
// phone + одноразовый код
//
// В этом случае сервер возвращает:
// forcePinChange: true
//
// После этого клиент должен установить
// новый постоянный PIN.
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
                role,
                one_time_pin,
                one_time_pin_used
            FROM users
            WHERE phone = ?
        `).get(phone);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Неверный номер телефона или PIN-код"
            });
        }

        const enteredPin = String(pin);

        // ========================================
        // ПРОВЕРЯЕМ ОДНОРАЗОВЫЙ КОД
        // ========================================

        if (
            user.one_time_pin &&
            user.one_time_pin_used === 0 &&
            user.one_time_pin === enteredPin
        ) {

            // Одноразовый код сразу помечаем использованным.
            db.prepare(`
                UPDATE users
                SET one_time_pin_used = 1
                WHERE id = ?
            `).run(user.id);

            console.log(
                `Использован одноразовый код: пользователь ${user.id}`
            );

            res.json({
                success: true,
                message: "Одноразовый код принят",
                forcePinChange: true,

                user: {
                    id: user.id,
                    name: user.name,
                    phone: user.phone,
                    balance: user.balance,
                    bonus: user.bonus,
                    role: user.role
                }
            });

            return;
        }

        // ========================================
        // ПРОВЕРЯЕМ ОБЫЧНЫЙ PIN
        // ========================================

        if (
            !user.pin ||
            user.pin !== enteredPin
        ) {
            return res.status(401).json({
                success: false,
                message: "Неверный номер телефона или PIN-код"
            });
        }

        // ========================================
        // УСПЕШНЫЙ ОБЫЧНЫЙ ВХОД
        // ========================================

        console.log(
            `Вход выполнен: пользователь ${user.id}, роль ${user.role}`
        );

        res.json({
            success: true,
            message: "Вход выполнен",
            forcePinChange: false,

            user: {
                id: user.id,
                name: user.name,
                phone: user.phone,
                balance: user.balance,
                bonus: user.bonus,
                role: user.role
            }
        });

    } catch (error) {

        console.error(
            "Ошибка входа:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// СПИСОК ПОЛЬЗОВАТЕЛЕЙ ДЛЯ АДМИНИСТРАТОРА
// ========================================
//
// Администратор передаёт свой номер.
//
// Пример:
// {
//     "adminPhone": "0228005110"
// }
//
// Сервер проверяет, что это admin.
// ========================================

app.get("/admin/users", (req, res) => {

    const adminPhone = req.query.adminPhone;

    if (!adminPhone) {
        return res.status(400).json({
            success: false,
            message: "Не указан номер администратора"
        });
    }

    try {

        const admin = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(adminPhone);

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        const users = db.prepare(`
            SELECT
                id,
                name,
                phone,
                balance,
                bonus,
                role
            FROM users
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            users: users
        });

    } catch (error) {

        console.error(
            "Ошибка получения пользователей:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// СБРОС PIN АДМИНИСТРАТОРОМ
// ========================================
//
// Администратор передаёт:
//
// {
//     "adminPhone": "0228005110",
//     "userPhone": "0555123456"
// }
//
// Сервер:
// 1. Проверяет администратора.
// 2. Находит клиента.
// 3. Старый PIN удаляет.
// 4. Создаёт одноразовый код.
// 5. Возвращает код администратору.
// ========================================

app.post("/admin/reset-pin", (req, res) => {

    const {
        adminPhone,
        userPhone
    } = req.body;

    if (!adminPhone || !userPhone) {
        return res.status(400).json({
            success: false,
            message: "Не указан администратор или пользователь"
        });
    }

    try {

        // ========================================
        // ПРОВЕРЯЕМ АДМИНИСТРАТОРА
        // ========================================

        const admin = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(adminPhone);

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        // ========================================
        // ИЩЕМ КЛИЕНТА
        // ========================================

        const user = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(userPhone);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // ========================================
        // НЕ ПОЗВОЛЯЕМ СБРАСЫВАТЬ PIN ДРУГОМУ ADMIN
        // ========================================

        if (user.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "PIN администратора нельзя сбросить этим способом"
            });
        }

        // ========================================
        // ГЕНЕРИРУЕМ ОДНОРАЗОВЫЙ КОД
        // ========================================

        const oneTimePin = String(
            Math.floor(
                1000 + Math.random() * 9000
            )
        );

        // ========================================
        // СТАРЫЙ PIN УДАЛЯЕМ
        //
        // Новый код записываем отдельно.
        // ========================================

        db.prepare(`
            UPDATE users
            SET
                pin = '',
                one_time_pin = ?,
                one_time_pin_used = 0
            WHERE id = ?
        `).run(
            oneTimePin,
            user.id
        );

        console.log(
            `Администратор ${admin.phone} сбросил PIN пользователя ${user.phone}`
        );

        console.log(
            `Одноразовый код для ${user.phone}: ${oneTimePin}`
        );

        // ========================================
        // ОТВЕТ АДМИНИСТРАТОРУ
        // ========================================

        res.json({
            success: true,
            message: "PIN сброшен",
            user: {
                id: user.id,
                name: user.name,
                phone: user.phone
            },
            oneTimePin: oneTimePin
        });

    } catch (error) {

        console.error(
            "Ошибка сброса PIN:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// ПОПОЛНЕНИЕ БОНУСОВ АДМИНИСТРАТОРОМ
// ========================================

app.post("/admin/add-bonus", (req, res) => {

    const {
        adminPhone,
        userId,
        amount
    } = req.body;

    if (!adminPhone || !userId || amount === undefined || amount === null) {
        return res.status(400).json({
            success: false,
            message: "Не указан администратор, пользователь или сумма"
        });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
            success: false,
            message: "Сумма должна быть больше нуля"
        });
    }

    try {

        // Проверяем администратора
        const admin = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(adminPhone);

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        // Ищем клиента
        const user = db.prepare(`
            SELECT
                id,
                name,
                phone,
                balance,
                bonus,
                role
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // Нельзя пополнять бонусы администратора
        if (user.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "Нельзя пополнить бонусы администратора"
            });
        }

        // Пополняем бонусы
        db.prepare(`
            UPDATE users
            SET bonus = bonus + ?
            WHERE id = ?
        `).run(
            numericAmount,
            user.id
        );

        // Получаем обновлённого пользователя
        const updatedUser = db.prepare(`
            SELECT
                id,
                name,
                phone,
                balance,
                bonus
            FROM users
            WHERE id = ?
        `).get(user.id);

        console.log(
            `Администратор ${admin.phone} пополнил бонусы пользователя ${user.phone} на ${numericAmount} сом`
        );

        res.json({
            success: true,
            message: "Бонусы успешно пополнены",
            user: updatedUser,
            amount: numericAmount
        });

    } catch (error) {

        console.error(
            "Ошибка пополнения бонусов администратором:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

// ========================================
// УСТАНОВКА НОВОГО PIN
// ========================================
//
// Используется после входа по одноразовому коду.
//
// Клиент передаёт:
//
// {
//     "phone": "...",
//     "newPin": "1234"
// }
//
// Одноразовый код уже был использован
// при входе, поэтому здесь достаточно
// установить новый постоянный PIN.
//
// После установки:
// one_time_pin = NULL
// one_time_pin_used = 0
// ========================================

app.post("/set-new-pin", (req, res) => {

    const {
        phone,
        newPin
    } = req.body;

    if (!phone || !newPin) {
        return res.status(400).json({
            success: false,
            message: "Укажите номер телефона и новый PIN-код"
        });
    }

    if (!/^\d{4}$/.test(String(newPin))) {
        return res.status(400).json({
            success: false,
            message: "PIN-код должен содержать 4 цифры"
        });
    }

    try {

        const user = db.prepare(`
            SELECT
                id,
                phone,
                one_time_pin,
                one_time_pin_used
            FROM users
            WHERE phone = ?
        `).get(phone);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // ========================================
        // НОВЫЙ PIN МОЖНО УСТАНОВИТЬ ТОЛЬКО
        // ПОСЛЕ ИСПОЛЬЗОВАНИЯ ОДНОРАЗОВОГО КОДА
        // ========================================

        if (
            !user.one_time_pin ||
            user.one_time_pin_used !== 1
        ) {
            return res.status(403).json({
                success: false,
                message: "Сначала войдите по одноразовому коду"
            });
        }

        // ========================================
        // СОХРАНЯЕМ НОВЫЙ PIN
        // ========================================

        db.prepare(`
            UPDATE users
            SET
                pin = ?,
                one_time_pin = NULL,
                one_time_pin_used = 0
            WHERE id = ?
        `).run(
            String(newPin),
            user.id
        );

        console.log(
            `Пользователь ${user.phone} установил новый PIN`
        );

        res.json({
            success: true,
            message: "Новый PIN-код установлен"
        });

    } catch (error) {

        console.error(
            "Ошибка установки нового PIN:",
            error
        );

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
        `).run(
            amount,
            userId
        );

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
// 10 сом = 1 импульс
// 20 сом = 2 импульса
// 50 сом = 5 импульсов
// 100 сом = 10 импульсов
// ========================================

// ========================================
// ОПЛАТА БОНУСАМИ
// ========================================
//
// 1 бонус = 1 сом
// 10 сом = 1 импульс
//
// Одновременно:
// 1. списываем бонусы клиента
// 2. сохраняем историю оплаты
// 3. создаём команду для ESP32
//
// ========================================

app.post("/pay-bonus", (req, res) => {

    const {
        userId,
        post,
        amount
    } = req.body;

    // ========================================
    // ПРОВЕРКА ДАННЫХ
    // ========================================

    if (!userId || !post || amount === undefined || amount === null) {
        return res.status(400).json({
            success: false,
            message: "Не указан пользователь, пост или сумма"
        });
    }

    const numericUserId = Number(userId);
    const numericPost = Number(post);
    const numericAmount = Number(amount);

    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
        return res.status(400).json({
            success: false,
            message: "Некорректный пользователь"
        });
    }

    if (numericPost !== 1 && numericPost !== 2) {
        return res.status(400).json({
            success: false,
            message: "Можно выбрать только Пост 1 или Пост 2"
        });
    }

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Некорректная сумма"
        });
    }

    // Сумма должна давать целое количество импульсов
    if (numericAmount % 10 !== 0) {
        return res.status(400).json({
            success: false,
            message: "Сумма должна быть кратна 10 сомам"
        });
    }

    try {

        // ========================================
        // ИЩЕМ КЛИЕНТА
        // ========================================

        const user = db.prepare(`
            SELECT
                id,
                name,
                phone,
                bonus,
                role
            FROM users
            WHERE id = ?
        `).get(numericUserId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Пользователь не найден"
            });
        }

        // Администратор не оплачивает бонусами
        if (user.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "Администратор не может оплачивать бонусами"
            });
        }

        // ========================================
        // ПРОВЕРЯЕМ БОНУСЫ
        // ========================================

        if (Number(user.bonus) < numericAmount) {
            return res.status(400).json({
                success: false,
                message: "Недостаточно бонусов"
            });
        }

        // ========================================
        // РАССЧИТЫВАЕМ ИМПУЛЬСЫ
        // ========================================

        const coins =
            Math.floor(numericAmount / 10);

        if (coins < 1) {
            return res.status(400).json({
                success: false,
                message: "Сумма слишком маленькая для импульса"
            });
        }

        // ========================================
        // ВРЕМЯ ОПЕРАЦИИ
        // ========================================

        const createdAt =
            new Date().toISOString();

        // ========================================
        // СПИСЫВАЕМ БОНУСЫ
        // ========================================

        db.prepare(`
            UPDATE users
            SET bonus = bonus - ?
            WHERE id = ?
        `).run(
            numericAmount,
            numericUserId
        );

        // ========================================
        // СОХРАНЯЕМ ИСТОРИЮ ОПЛАТЫ
        // ========================================

        const history = db.prepare(`
            INSERT INTO bonus_payments
            (
                user_id,
                user_name,
                user_phone,
                post,
                amount,
                coins,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            user.id,
            user.name,
            user.phone,
            numericPost,
            numericAmount,
            coins,
            createdAt
        );

        const historyId =
            Number(history.lastInsertRowid);

        // ========================================
        // СОЗДАЁМ КОМАНДУ ESP32
        // ========================================

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
            createdAt
        );

        const commandId =
            Number(command.lastInsertRowid);

// ========================================
// СОХРАНЯЕМ ОПЛАТУ БОНУСАМИ В ИСТОРИЮ
// ========================================

db.prepare(`
    INSERT INTO bonus_payments
    (
        user_id,
        user_name,
        user_phone,
        post,
        amount,
        coins,
        created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
    user.id,
    user.name,
    user.phone,
    post,
    Number(amount),
    coins,
    createdAt
);

console.log(
    `История бонусов сохранена: ${user.name}, ${user.phone}, пост ${post}, ${amount} сом`
);

        // ========================================
        // ПОЛУЧАЕМ НОВЫЙ БАЛАНС БОНУСОВ
        // ========================================

        const updatedUser = db.prepare(`
            SELECT
                id,
                name,
                phone,
                bonus
            FROM users
            WHERE id = ?
        `).get(numericUserId);

        // ========================================
        // ЛОГ
        // ========================================

        console.log(
            "================================="
        );

        console.log(
            "ОПЛАТА БОНУСАМИ"
        );

        console.log(
            "Клиент:",
            user.name
        );

        console.log(
            "Телефон:",
            user.phone
        );

        console.log(
            "Пост:",
            numericPost
        );

        console.log(
            "Сумма:",
            numericAmount,
            "сом"
        );

        console.log(
            "Импульсов:",
            coins
        );

        console.log(
            "История ID:",
            historyId
        );

        console.log(
            "ESP32 команда:",
            commandId
        );

        console.log(
            "================================="
        );

        // ========================================
        // ОТВЕТ
        // ========================================

        res.json({
            success: true,

            message:
                "Оплата бонусами выполнена",

            user: updatedUser,

            post: numericPost,

            amount: numericAmount,

            coins: coins,

            historyId: historyId,

            commandId: commandId,

            createdAt: createdAt
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
// ИСТОРИЯ ОПЛАТ БОНУСАМИ
// ========================================

app.get("/bonus-payments", (req, res) => {

    try {

        const payments = db.prepare(`
            SELECT
                id,
                user_id,
                user_name,
                user_phone,
                post,
                amount,
                coins,
                created_at
            FROM bonus_payments
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            payments: payments
        });

    } catch (error) {

        console.error(
            "Ошибка получения истории бонусов:",
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

    const {
        post,
        amount
    } = req.body;

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

    const createdAt =
        new Date().toISOString();

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

    const {
        paymentId
    } = req.params;

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

    const {
        paymentId
    } = req.params;

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

        const createdAt =
            new Date().toISOString();

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

        const commandId =
            Number(command.lastInsertRowid);

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
// АДМИН — РУЧНОЙ ЗАПУСК ПОСТА
// ========================================
//
// Администратор передаёт:
//
// {
//     "adminPhone": "номер администратора",
//     "post": 1,
//     "amount": 30
// }
//
// 10 сом = 1 импульс
//
// Пост 1 → ESP32 → GPIO2
// Пост 2 → ESP32 → GPIO15
//
// ========================================

app.post("/admin/manual-post", (req, res) => {

    const {
        adminPhone,
        post,
        amount
    } = req.body;

    // ----------------------------------------
    // ПРОВЕРКА ДАННЫХ
    // ----------------------------------------

    if (!adminPhone || !post || amount === undefined) {
        return res.status(400).json({
            success: false,
            message: "Не указан администратор, пост или сумма"
        });
    }

    const postNumber = Number(post);
    const sum = Number(amount);

    // ----------------------------------------
    // ПРОВЕРЯЕМ ПОСТ
    // ----------------------------------------

    if (postNumber !== 1 && postNumber !== 2) {
        return res.status(400).json({
            success: false,
            message: "Можно выбрать только Пост 1 или Пост 2"
        });
    }

    // ----------------------------------------
    // ПРОВЕРЯЕМ СУММУ
    // ----------------------------------------

    if (!Number.isFinite(sum) || sum <= 0) {
        return res.status(400).json({
            success: false,
            message: "Введите корректную сумму"
        });
    }

    // Сумма должна быть кратна 10
    if (sum % 10 !== 0) {
        return res.status(400).json({
            success: false,
            message: "Сумма должна быть кратна 10 сомам"
        });
    }

    // ----------------------------------------
    // ПРОВЕРЯЕМ АДМИНИСТРАТОРА
    // ----------------------------------------

    try {

        const admin = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(adminPhone);

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        // ----------------------------------------
        // РАССЧИТЫВАЕМ ИМПУЛЬСЫ
        // ----------------------------------------

        const coins = Math.floor(sum / 10);

        // ----------------------------------------
        // СОЗДАЁМ КОМАНДУ ДЛЯ ESP32
        // ----------------------------------------

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
            postNumber,
            coins,
            createdAt
        );

        const commandId =
            Number(command.lastInsertRowid);

        console.log(
            "================================="
        );

        console.log(
            "АДМИН — РУЧНОЙ ЗАПУСК ПОСТА"
        );

        console.log(
            "Администратор:",
            admin.phone
        );

        console.log(
            "Пост:",
            postNumber
        );

        console.log(
            "Сумма:",
            sum,
            "сом"
        );

        console.log(
            "Импульсов:",
            coins
        );

        console.log(
            "Команда:",
            commandId
        );

        console.log(
            "================================="
        );

        // ----------------------------------------
        // ОТВЕТ
        // ----------------------------------------

        res.json({
            success: true,
            message:
                `Пост ${postNumber} запущен`,
            post: postNumber,
            amount: sum,
            coins: coins,
            commandId: commandId
        });

    } catch (error) {

        console.error(
            "Ошибка ручного запуска поста:",
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
// ESP32:
// /esp32/command?post=1
//
// Сервер отдаёт первую pending-команду.
// После выдачи команда становится sent.
// ========================================

// ========================================
// РУЧНОЙ ЗАПУСК ПОСТА АДМИНИСТРАТОРОМ
// ========================================
//
// Администратор указывает:
// - пост
// - сумму
//
// 10 сом = 1 импульс
//
// Пост 1 → GPIO2
// Пост 2 → GPIO15
//
// Команда записывается в esp32_commands.
// ESP32 забирает её через /esp32/command
// ========================================

app.post("/admin/manual-post", (req, res) => {

    const {
        adminPhone,
        post,
        amount
    } = req.body;

    // ----------------------------------------
    // ПРОВЕРКА ДАННЫХ
    // ----------------------------------------

    if (!adminPhone || post === undefined || amount === undefined) {
        return res.status(400).json({
            success: false,
            message: "Не указан администратор, пост или сумма"
        });
    }

    const numericPost = Number(post);
    const numericAmount = Number(amount);

    // ----------------------------------------
    // ПРОВЕРЯЕМ ПОСТ
    // ----------------------------------------

    if (numericPost !== 1 && numericPost !== 2) {
        return res.status(400).json({
            success: false,
            message: "Неверный номер поста"
        });
    }

    // ----------------------------------------
    // ПРОВЕРЯЕМ СУММУ
    // ----------------------------------------

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount < 10
    ) {
        return res.status(400).json({
            success: false,
            message: "Минимальная сумма — 10 сом"
        });
    }

    // Сумма должна быть кратна 10
    if (numericAmount % 10 !== 0) {
        return res.status(400).json({
            success: false,
            message: "Сумма должна быть кратна 10 сом"
        });
    }

    try {

        // ----------------------------------------
        // ПРОВЕРЯЕМ АДМИНИСТРАТОРА
        // ----------------------------------------

        const admin = db.prepare(`
            SELECT
                id,
                name,
                phone,
                role
            FROM users
            WHERE phone = ?
        `).get(adminPhone);

        if (!admin || admin.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Доступ запрещён"
            });
        }

        // ----------------------------------------
        // РАССЧИТЫВАЕМ ИМПУЛЬСЫ
        // ----------------------------------------

        const coins = Math.floor(
            numericAmount / 10
        );

        // ----------------------------------------
        // СОЗДАЁМ ID ПЛАТЕЖА
        // ----------------------------------------

        const paymentId =
            "ADMIN-" +
            Date.now() +
            "-" +
            Math.floor(
                Math.random() * 1000
            );

        const createdAt =
            new Date().toISOString();

        // ----------------------------------------
        // СОХРАНЯЕМ В ИСТОРИЮ ПЛАТЕЖЕЙ
        // ----------------------------------------

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
            numericPost,
            numericAmount,
            "paid",
            createdAt
        );

        // ----------------------------------------
        // СОЗДАЁМ КОМАНДУ ДЛЯ ESP32
        // ----------------------------------------

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
            createdAt
        );

        const commandId =
            Number(command.lastInsertRowid);

        // ----------------------------------------
        // ЛОГ
        // ----------------------------------------

        console.log(
            `АДМИН ${admin.phone}: пост ${numericPost}, сумма ${numericAmount} сом, импульсов ${coins}, команда ${commandId}`
        );

        // ----------------------------------------
        // ОТВЕТ ПРИЛОЖЕНИЮ
        // ----------------------------------------

        res.json({
            success: true,
            message: "Пост успешно запущен",

            paymentId: paymentId,

            post: numericPost,

            amount: numericAmount,

            coins: coins,

            commandId: commandId
        });

    } catch (error) {

        console.error(
            "Ошибка ручного запуска поста:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });
    }
});

app.get("/esp32/command", (req, res) => {

    const post =
        Number(req.query.post);

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

    const {
        paymentId
    } = req.params;

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

        const createdAt =
            new Date().toISOString();

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

        const commandId =
            Number(command.lastInsertRowid);

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
// FAKE BANK — ВРЕМЕННАЯ ИМИТАЦИЯ MBANK
// ========================================
//
// Используется только для тестирования.
//
// Фиксированные суммы:
// 20 сом  = 2 импульса
// 50 сом  = 5 импульсов
// 100 сом = 10 импульсов
// 200 сом = 20 импульсов
//
// Схема:
//
// FakeBank
//    ↓
// WashQR Server
//    ↓
// payment = paid
//    ↓
// esp32_commands
//    ↓
// ESP32
//
// ========================================


// ----------------------------------------
// СТРАНИЦА FAKE BANK
// ----------------------------------------

app.get("/fake-bank", (req, res) => {

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">

        <head>

            <meta charset="UTF-8">

            <meta name="viewport"
                  content="width=device-width, initial-scale=1.0">

            <title>FakeBank — WashQR</title>

            <style>

                body {
                    margin: 0;
                    padding: 20px;

                    font-family: Arial, sans-serif;

                    background:
                        linear-gradient(
                            135deg,
                            #0D47A1,
                            #1976D2
                        );

                    min-height: 100vh;
                }

                .container {
                    max-width: 500px;
                    margin: auto;
                }

                .header {
                    background: white;

                    padding: 25px;

                    border-radius: 20px;

                    text-align: center;

                    margin-bottom: 20px;
                }

                .header h1 {
                    margin: 0;

                    color: #0D47A1;

                    font-size: 32px;
                }

                .header p {
                    color: #666;

                    margin-bottom: 0;
                }

                .card {
                    background: white;

                    border-radius: 20px;

                    padding: 20px;

                    margin-bottom: 15px;

                    box-shadow:
                        0 5px 20px
                        rgba(0,0,0,0.2);
                }

                .card h2 {
                    margin-top: 0;

                    color: #222;
                }

                input {
                    width: 100%;

                    box-sizing: border-box;

                    padding: 14px;

                    border: 1px solid #ddd;

                    border-radius: 10px;

                    font-size: 16px;

                    margin-bottom: 15px;
                }

                button {
                    width: 100%;

                    border: none;

                    padding: 16px;

                    border-radius: 12px;

                    background: #1976D2;

                    color: white;

                    font-size: 18px;

                    font-weight: bold;

                    cursor: pointer;
                }

                button:hover {
                    background: #0D47A1;
                }

                .amount {
                    font-size: 26px;

                    font-weight: bold;

                    color: #0D47A1;

                    margin-bottom: 15px;
                }

                .result {
                    display: none;

                    background: #E8F5E9;

                    color: #2E7D32;

                    padding: 20px;

                    border-radius: 15px;

                    margin-top: 20px;

                    line-height: 1.7;
                }

                .error {
                    display: none;

                    background: #FFEBEE;

                    color: #C62828;

                    padding: 20px;

                    border-radius: 15px;

                    margin-top: 20px;
                }

            </style>

        </head>

        <body>

            <div class="container">

                <div class="header">

                    <h1>🏦 FakeBank</h1>

                    <p>
                        Временная имитация MBANK
                    </p>

                </div>


                <div class="card">

                    <h2>Выберите пост</h2>

                    <input
                        id="post"
                        type="number"
                        min="1"
                        value="1"
                        placeholder="Номер поста"
                    >

                </div>


                <div class="card">

                    <h2>Выберите сумму</h2>


                    <div class="amount">
                        20 сом
                    </div>

                    <button
                        onclick="pay(20)"
                    >
                        💳 Оплатить 20 сом
                    </button>

                </div>


                <div class="card">

                    <div class="amount">
                        50 сом
                    </div>

                    <button
                        onclick="pay(50)"
                    >
                        💳 Оплатить 50 сом
                    </button>

                </div>


                <div class="card">

                    <div class="amount">
                        100 сом
                    </div>

                    <button
                        onclick="pay(100)"
                    >
                        💳 Оплатить 100 сом
                    </button>

                </div>


                <div class="card">

                    <div class="amount">
                        200 сом
                    </div>

                    <button
                        onclick="pay(200)"
                    >
                        💳 Оплатить 200 сом
                    </button>

                </div>


                <div
                    id="result"
                    class="result"
                ></div>


                <div
                    id="error"
                    class="error"
                ></div>

            </div>


            <script>

                async function pay(amount) {

                    const post =
                        Number(
                            document.getElementById("post").value
                        );

                    const result =
                        document.getElementById("result");

                    const error =
                        document.getElementById("error");


                    result.style.display = "none";

                    error.style.display = "none";


                    if (!post || post < 1) {

                        error.innerHTML =
                            "Введите правильный номер поста.";

                        error.style.display = "block";

                        return;
                    }


                    try {

                        // --------------------------------
                        // Сначала создаём платёж
                        // --------------------------------

                        const createResponse =
                            await fetch(
                                "/fake-bank/create-payment",
                                {
                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },

                                    body: JSON.stringify({
                                        post: post,
                                        amount: amount
                                    })
                                }
                            );


                        const createData =
                            await createResponse.json();


                        if (!createData.success) {

                            throw new Error(
                                createData.message ||
                                "Не удалось создать платёж"
                            );
                        }


                        const paymentId =
                            createData.payment.id;


                        // --------------------------------
                        // Имитируем успешную оплату банка
                        // --------------------------------

                        const payResponse =
                            await fetch(
                                "/fake-bank/pay/" +
                                paymentId,
                                {
                                    method: "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    }
                                }
                            );


                        const payData =
                            await payResponse.json();


                        if (!payData.success) {

                            throw new Error(
                                payData.message ||
                                "Ошибка оплаты"
                            );
                        }


                        // --------------------------------
                        // Показываем результат
                        // --------------------------------

                        result.innerHTML =

                            "✅ <strong>Платёж подтверждён</strong><br><br>" +

                            "ID платежа: " +
                            payData.payment.id +
                            "<br>" +

                            "Пост: " +
                            payData.payment.post +
                            "<br>" +

                            "Сумма: " +
                            payData.payment.amount +
                            " сом<br>" +

                            "Импульсов ESP32: " +
                            payData.coins +
                            "<br>" +

                            "Команда ESP32: №" +
                            payData.commandId;


                        result.style.display = "block";


                    } catch (err) {

                        error.innerHTML =
                            "❌ " + err.message;

                        error.style.display = "block";

                    }

                }

            </script>

        </body>

        </html>
    `);
});


// ----------------------------------------
// FAKE BANK — СОЗДАНИЕ ПЛАТЕЖА
// ----------------------------------------

app.post("/fake-bank/create-payment", (req, res) => {

    const {
        post,
        amount
    } = req.body;


    const allowedAmounts = [
        20,
        50,
        100,
        200
    ];


    const numericPost =
        Number(post);

    const numericAmount =
        Number(amount);


    if (
        !numericPost ||
        numericPost < 1
    ) {

        return res.status(400).json({
            success: false,
            message: "Неверный номер поста"
        });
    }


    if (
        !allowedAmounts.includes(
            numericAmount
        )
    ) {

        return res.status(400).json({
            success: false,
            message:
                "Разрешены только суммы 20, 50, 100 и 200 сом"
        });
    }


    const paymentId =
        "FAKE-" +
        Date.now() +
        "-" +
        Math.floor(
            Math.random() * 1000
        );


    const createdAt =
        new Date().toISOString();


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
            numericPost,
            numericAmount,
            "pending",
            createdAt
        );


        const payment =
            db.prepare(`
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
            "FakeBank создал платёж:",
            payment
        );


        res.json({
            success: true,
            payment: payment
        });


    } catch (error) {

        console.error(
            "Ошибка FakeBank:",
            error
        );


        res.status(500).json({
            success: false,
            message: "Ошибка создания тестового платежа"
        });

    }

});


// ----------------------------------------
// FAKE BANK — ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА
// ----------------------------------------

app.post("/fake-bank/pay/:paymentId", (req, res) => {

    const {
        paymentId
    } = req.params;


    try {

        const payment =
            db.prepare(`
                SELECT
                    *
                FROM payments
                WHERE id = ?
            `).get(paymentId);


        if (!payment) {

            return res.status(404).json({
                success: false,
                message: "Платёж не найден"
            });

        }


        // --------------------------------
        // Защита от повторной оплаты
        // --------------------------------

        if (
            payment.status === "paid"
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Этот платёж уже подтверждён"
            });

        }


        // --------------------------------
        // Проверяем сумму
        // --------------------------------

        const allowedAmounts = [
            20,
            50,
            100,
            200
        ];


        if (
            !allowedAmounts.includes(
                Number(payment.amount)
            )
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Недопустимая сумма платежа"
            });

        }


        // --------------------------------
        // Подтверждаем платёж
        // --------------------------------

        db.prepare(`
            UPDATE payments
            SET status = 'paid'
            WHERE id = ?
        `).run(
            paymentId
        );


        // --------------------------------
        // Рассчитываем импульсы
        //
        // 10 сом = 1 импульс
        // --------------------------------

        const coins =
            Math.floor(
                Number(payment.amount) / 10
            );


        // --------------------------------
        // Создаём команду для ESP32
        // --------------------------------

        const createdAt =
            new Date().toISOString();


        const command =
            db.prepare(`
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


        const commandId =
            Number(
                command.lastInsertRowid
            );


        console.log(
            "================================="
        );

        console.log(
            "FAKE BANK: ПЛАТЁЖ ПОДТВЕРЖДЁН"
        );

        console.log(
            "Payment:",
            payment.id
        );

        console.log(
            "Post:",
            payment.post
        );

        console.log(
            "Amount:",
            payment.amount,
            "сом"
        );

        console.log(
            "ESP32 impulses:",
            coins
        );

        console.log(
            "ESP32 command:",
            commandId
        );

        console.log(
            "================================="
        );


        // --------------------------------
        // Ответ
        // --------------------------------

        res.json({

            success: true,

            message:
                "FakeBank подтвердил платёж",

            payment: {
                id: payment.id,

                post: payment.post,

                amount: payment.amount,

                status: "paid"
            },

            coins: coins,

            commandId: commandId

        });


    } catch (error) {

        console.error(
            "Ошибка подтверждения FakeBank:",
            error
        );


        res.status(500).json({
            success: false,
            message: "Ошибка сервера"
        });

    }

});


// ----------------------------------------
// FAKE BANK — ИНФОРМАЦИЯ О СИСТЕМЕ
// ----------------------------------------

app.get("/fake-bank/info", (req, res) => {

    res.json({

        success: true,

        bank: "FakeBank",

        mode: "TEST",

        message:
            "Временная имитация MBANK",

        fixedAmounts: [
            20,
            50,
            100,
            200
        ],

        impulseRate:
            "10 сом = 1 импульс",

        amounts: {

            "20": 2,

            "50": 5,

            "100": 10,

            "200": 20

        }

    });

});

// ========================================
// ЗАПУСК СЕРВЕРА
// ========================================

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================="
        );

        console.log(
            "База WashQR готова."
        );

        console.log(
            "WashQR Server запущен"
        );

        console.log(
            "Порт:",
            PORT
        );

        console.log(
            "================================="
        );
    }
);