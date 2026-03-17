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

// نموذج المستخدم الاحترافي
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

// واجهة التليجرام
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 **Trading Pro جاهز للعمل**\n\nاضبط إعداداتك وابدأ التداول الآلي الآن:", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🖥️ فتح لوحة التحكم", web_app: { url: WEBAPP_URL } }]] }
    });
});

// حفظ الإعدادات من واجهة الويب
app.post("/save-config", async (req, res) => {
    try {
        const { telegramId, ...data } = req.body;
        await User.findOneAndUpdate({ telegramId }, { ...data, active: true }, { upsert: true });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- محرك الاستراتيجيات ---
async function runBotLogic(user) {
    try {
        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        const ohlcv = await exchange.fetchOHLCV(user.symbol, '15m', undefined, 20);
        const prices = ohlcv.map(x => x[4]);
        const currentPrice = prices[prices.length - 1];

        console.log(`🤖 فحص ${user.symbol} للمستخدم ${user.telegramId} | السعر: ${currentPrice}`);

        if (user.strategy === 'RSI') {
            // استراتيجية RSI (مثال شراء عند التشبع)
            console.log("التحقق من RSI...");
            // هنا يتم تنفيذ تنفيذ الأوامر: exchange.createMarketOrder(user.symbol, 'buy', user.amount/currentPrice)
        } else if (user.strategy === 'Scalping') {
            // استراتيجية تقاطع المتوسطات
            console.log("تحليل Scalping...");
        }
    } catch (e) { console.log(`⚠️ خطأ تداول: ${e.message}`); }
}

// فحص دوري كل 60 ثانية
setInterval(async () => {
    const activeUsers = await User.find({ active: true });
    activeUsers.forEach(runBotLogic);
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));