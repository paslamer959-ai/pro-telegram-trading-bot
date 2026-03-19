// ==================== بوت التداول الذكي - نسخة محسنة مع حفظ البيانات ====================

const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const ccxt = require('ccxt');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== تحسين الأداء ====================
app.use(require('compression')());

// ==================== التحقق من الإعدادات ====================
if (!config.BOT_TOKEN) {
    console.error('❌ خطأ: توكن البوت غير موجود');
    process.exit(1);
}

if (!config.MONGO_URL) {
    console.error('❌ خطأ: رابط قاعدة البيانات غير موجود');
    process.exit(1);
}

// ==================== تشغيل البوت ====================
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
console.log('✅ البوت يعمل...');

// ==================== الاتصال بقاعدة البيانات مع تحسينات ====================
mongoose.connect(config.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'TradingPro' // تأكيد اسم قاعدة البيانات
})
.then(() => {
    console.log('✅ متصل بقاعدة البيانات بنجاح');
    console.log('📁 قاعدة البيانات: TradingPro');
})
.catch(err => {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.message);
});

// ==================== نموذج المستخدم ====================
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: String,
    firstName: String,
    lastName: String,
    
    selectedExchange: { type: String, default: 'bingx' },
    
    exchanges: {
        bingx: {
            apiKey: { type: String, default: '' },
            apiSecret: { type: String, default: '' },
            isActive: { type: Boolean, default: false }
        },
        binance: {
            apiKey: { type: String, default: '' },
            apiSecret: { type: String, default: '' },
            isActive: { type: Boolean, default: false }
        },
        bybit: {
            apiKey: { type: String, default: '' },
            apiSecret: { type: String, default: '' },
            isActive: { type: Boolean, default: false }
        },
        mexc: {
            apiKey: { type: String, default: '' },
            apiSecret: { type: String, default: '' },
            isActive: { type: Boolean, default: false }
        }
    },
    
    activeSymbol: { type: String, default: 'BTC/USDT' },
    tradeAmount: { type: Number, default: 10 },
    isRunning: { type: Boolean, default: false },
    totalProfit: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    
    favoriteSymbols: [{
        symbol: String,
        exchange: { type: String, default: 'bingx' },
        lastActive: { type: Date, default: Date.now }
    }],
    
    currentTrade: {
        symbol: String,
        exchange: String,
        entryPrice: Number,
        takeProfit: Number,
        stopLoss: Number,
        entryTime: Date,
        orderId: String,
        status: { type: String, default: 'closed' }
    },
    
    tradeHistory: [{
        symbol: String,
        exchange: String,
        entryPrice: Number,
        exitPrice: Number,
        profit: Number,
        profitPercent: Number,
        entryTime: Date,
        exitTime: Date,
        reason: String
    }],
    
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==================== التأكد من إنشاء المجموعة ====================
(async () => {
    try {
        // التحقق من وجود المجموعة
        const collections = await mongoose.connection.db.listCollections({ name: 'users' }).toArray();
        if (collections.length === 0) {
            console.log('📁 جاري إنشاء مجموعة users...');
            await User.createCollection();
            console.log('✅ تم إنشاء مجموعة users بنجاح');
        } else {
            console.log('✅ مجموعة users موجودة مسبقاً');
        }
    } catch (error) {
        console.error('❌ خطأ في التحقق من المجموعة:', error.message);
    }
})();

// ==================== القائمة الرئيسية ====================
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: "🚀 فتح البوت", web_app: { url: config.WEBAPP_URL } }, { text: "📊 السوق" }],
            [{ text: "💰 رصيدي" }, { text: "📈 أرباحي" }],
            [{ text: "⚙️ الإعدادات" }, { text: "❓ المساعدة" }],
            [{ text: "🔄 تشغيل البوت" }, { text: "🛑 إيقاف البوت" }]
        ],
        resize_keyboard: true
    }
};

// ==================== أوامر البوت ====================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';
    
    try {
        // البحث عن المستخدم أو إنشاؤه
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            // مستخدم جديد - ننشئ له سجل
            user = new User({
                telegramId,
                firstName,
                username: msg.from.username || ''
            });
            await user.save();
            console.log(`✅ مستخدم جديد تم حفظه: ${telegramId}`);
        } else {
            // تحديث آخر نشاط
            user.lastActive = new Date();
            await user.save();
            console.log(`✅ مستخدم موجود: ${telegramId}`);
        }

        const welcomeMessage = `
🌟 *مرحباً بك ${firstName} في بوت التداول الذكي!* 🌟

✅ تم حفظ بياناتك في قاعدة البيانات
💰 رصيدك الحالي: ${user.totalProfit} USDT
⭐ عدد المفضلة: ${user.favoriteSymbols.length}

⬇️ *اختر من القائمة أدناه:* ⬇️
        `;

        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...mainKeyboard
        });

    } catch (error) {
        console.error('خطأ في أمر /start:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ، حاول مرة أخرى');
    }
});

// ==================== API جلب بيانات المستخدم ====================
app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ error: 'مستخدم غير موجود' });
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API جلب الرصيد الحقيقي ====================
app.get("/api/real-balance/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ success: false, balance: 0 });
        }
        
        // محاولة جلب الرصيد من المنصة
        try {
            const exchange = new ccxt[user.selectedExchange]({
                apiKey: user.exchanges[user.selectedExchange]?.apiKey,
                secret: user.exchanges[user.selectedExchange]?.apiSecret
            });
            
            const balance = await exchange.fetchBalance();
            const usdtBalance = balance.USDT?.free || 0;
            
            res.json({ 
                success: true, 
                balance: usdtBalance,
                exchange: user.selectedExchange
            });
            
        } catch (exchangeError) {
            // إذا فشل جلب الرصيد، نعيد 0
            res.json({ 
                success: false, 
                balance: 0,
                error: exchangeError.message
            });
        }
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API إضافة للمفضلة ====================
app.post("/api/add-to-favorites", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        // التحقق من وجود العملة
        const exists = user.favoriteSymbols.some(f => f.symbol === symbol);
        
        if (!exists) {
            user.favoriteSymbols.push({
                symbol,
                exchange: user.selectedExchange,
                lastActive: new Date()
            });
            user.tradeAmount = amount;
            await user.save();
            
            console.log(`✅ تم حفظ ${symbol} في مفضلة المستخدم ${telegramId}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API حفظ مفاتيح API ====================
app.post("/api/save-exchange-keys", async (req, res) => {
    try {
        const { telegramId, exchange, apiKey, apiSecret } = req.body;
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        // حفظ المفاتيح
        user.exchanges[exchange].apiKey = apiKey;
        user.exchanges[exchange].apiSecret = apiSecret;
        user.exchanges[exchange].isActive = true;
        
        await user.save();
        
        console.log(`✅ تم حفظ مفاتيح ${exchange} للمستخدم ${telegramId}`);
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API تغيير المنصة النشطة ====================
app.post("/api/set-active-exchange", async (req, res) => {
    try {
        const { telegramId, exchange } = req.body;
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        user.selectedExchange = exchange;
        await user.save();
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API جلب بيانات السوق ====================
app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ results: [], balance: 0, isRunning: false });
        }

        const exchange = new ccxt.bingx();
        let results = [];

        for (let fav of user.favoriteSymbols) {
            try {
                const ticker = await exchange.fetchTicker(fav.symbol);
                results.push({
                    symbol: fav.symbol,
                    price: ticker.last?.toFixed(2) || '0',
                    change: ticker.percentage?.toFixed(2) || '0',
                    exchange: fav.exchange
                });
            } catch (e) {
                console.log(`خطأ في جلب ${fav.symbol}:`, e.message);
            }
        }
        
        res.json({ 
            results,
            balance: user.totalProfit,
            isRunning: user.isRunning,
            activeSymbol: user.activeSymbol
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== الصفحة الرئيسية ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== مسار الصحة ====================
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'alive',
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        time: new Date().toISOString()
    });
});

// ==================== تشغيل الخادم ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📁 قاعدة البيانات: TradingPro`);
    console.log(`📱 البوت: https://t.me/${config.BOT_USERNAME}`);
});