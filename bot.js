const TelegramBot = require("node-telegram-bot-api");
const { TOKEN, WEBAPP_URL } = require("./config");

// إنشاء البوت مع تفعيل معالجة الأخطاء
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("⏳ جاري محاولة الاتصال بتليجرام...");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`✅ تم استقبال أمر من المستخدم: ${chatId}`);

    bot.sendMessage(chatId, "🚀 مرحباً بك في منصة التداول الذكية\nإضغط على الزر أدناه للبدء:", {
        reply_markup: {
            inline_keyboard: [
                [{
                    text: "📊 فتح المنصة الآن",
                    web_app: { url: WEBAPP_URL }
                }]
            ]
        }
    });
});

// هذا الجزء سيكشف لك لماذا لا يتفاعل البوت
bot.on("polling_error", (error) => {
    console.error("❌ خطأ في الاتصال (قد يكون التوكن خطأ أو الشبكة):", error.code);
});

bot.on("error", (error) => {
    console.error("❌ خطأ عام:", error.message);
});