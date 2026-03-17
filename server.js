const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api"); // إضافة مكتبة البوت

const User = require("./database");
const startTrading = require("./strategy");
const { TOKEN, WEBAPP_URL } = require("./config"); // استيراد التوكن والرابط

const app = express();
app.use(bodyParser.json());
app.use(express.static("web"));

// --- الجزء الخاص ببوت تليجرام ---
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("⏳ جاري تشغيل بوت تليجرام...");

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 مرحباً بك في منصة التداول الذكية", {
        reply_markup: {
            inline_keyboard: [[{
                text: "📊 فتح المنصة",
                web_app: { url: WEBAPP_URL }
            }]]
        }
    });
});
// -----------------------------

app.post("/save-api", async (req, res) => {
    const { telegramId, apiKey, apiSecret } = req.body;
    await User.findOneAndUpdate(
        { telegramId },
        { apiKey, apiSecret, active: true },
        { upsert: true }
    );
    res.json({ message: "API saved" });
});

// تشغيل الاستراتيجية لكل المستخدمين النشطين
setInterval(async () => {
    try {
        const users = await User.find({ active: true });
        for (const user of users) {
            startTrading(user);
        }
    } catch (error) {
        console.error("Error in trading interval:", error);
    }
}, 15000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server and Bot are running on port ${PORT}`);
});