// ==================== ملف الإعدادات ====================

module.exports = {
    // ✅ توكن البوت الجديد
    BOT_TOKEN: "7715705527:AAHimpn_L_YU4Vr_gTIjvJH1rhRVwxwN3Hk",
    
    // رابط قاعدة بيانات MongoDB
    MONGO_URL: "mongodb+srv://username:password@cluster.mongodb.net/trading-os",
    
    // رابط التطبيق على Render
    WEBAPP_URL: "https://trading-os-bot.onrender.com",
    
    // ✅ اسم المستخدم للبوت الجديد
    BOT_USERNAME: "Trading_Pro66_bot",
    
    // ✅ رابط قناة الدعم الجديد
    SUPPORT_CHAT: "https://t.me/RealGainsOnly",
    
    PORT: process.env.PORT || 10000,
    NODE_ENV: process.env.NODE_ENV || 'development'
};