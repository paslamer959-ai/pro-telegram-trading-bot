// ==================== ملف الإعدادات - Trading Pro Bot ====================

module.exports = {
    // ✅ توكن البوت من BotFather
    BOT_TOKEN: "7715705527:AAHimpn_L_YU4Vr_gTIjvJH1rhRVwxwN3Hk",
    
    // ✅ رابط MongoDB الصحيح مع اسم قاعدة البيانات TradingPro
    MONGO_URL: "mongodb+srv://qais:qais959@cluster0.ggc3dpc.mongodb.net/?appName=Cluster0",
    
    // ✅ رابط التطبيق على Render
    WEBAPP_URL: "https://pro-telegram-trading-bot.onrender.com",
    
    // ✅ اسم المستخدم للبوت (بدون @)
    BOT_USERNAME: "Trading_Pro_bot",
    
    // ✅ رابط قناة الدعم
    SUPPORT_CHAT: "https://t.me/RealGainsOnly",
    
    // ✅ إعدادات إضافية
    PORT: process.env.PORT || 10000,
    NODE_ENV: process.env.NODE_ENV || 'development'
};
