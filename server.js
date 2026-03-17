const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const ccxt = require("ccxt");
const path = require("path");
const { TOKEN, MONGO_URL, WEBAPP_URL } = require("./config");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// الاتصال بقاعدة البيانات
mongoose.connect(MONGO_URL).then(() => console.log("📦 MongoDB Connected"));

// نموذج المستخدم
const User = mongoose.model("User", new mongoose.Schema({
    telegramId: String,
    exchangeId: { type: String, default: 'bingx' },
    apiKey: String,
    apiSecret: String,
    symbol: { type: String, default: 'BTC/USDT' },
    amount: { type: Number, default: 10 },
    strategy: { type: String, default: 'RSI' },
    active: { type: Boolean, default: false }
}));

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 **مرحباً بك في نظام التداول الذكي**\nاستخدم اللوحة للتحكم في صفقاتك:", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🖥️ فتح لوحة التحكم", web_app: { url: WEBAPP_URL } }]] }
    });
});

// حفظ الإعدادات من الواجهة
app.post("/save-config", async (req, res) => {
    try {
        const { telegramId, ...data } = req.body;
        await User.findOneAndUpdate({ telegramId }, { ...data, active: true }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// محرك التداول والاستراتيجيات
async function runBotLogic(user) {
    try {
        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        const ticker = await exchange.fetchTicker(user.symbol);
        const price = ticker.last;

        console.log(`🤖 فحص: ${user.symbol} | المنصة: ${user.exchangeId} | السعر: ${price}`);

        // منطق مبسط للاستراتيجيات (كمثال)
        if (user.strategy === 'RSI') {
            // هنا تضاف معادلة RSI الحقيقية
            console.log("التحقق من مؤشر RSI...");
        } else if (user.strategy === 'Scalping') {
            console.log("تنفيذ استراتيجية المضاربة السريعة...");
        }
    } catch (e) { console.log(`Error: ${e.message}`); }
}

// فحص السوق كل دقيقة لكل مستخدم نشط
setInterval(async () => {
    const activeUsers = await User.find({ active: true });
    activeUsers.forEach(runBotLogic);
}, 60000);

app.listen(process.env.PORT || 3000, () => console.log("🚀 Server Live"));