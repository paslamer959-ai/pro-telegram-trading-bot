// ==================== بوت التداول الذكي - نسخة محسنة بالكامل ====================

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
    console.error('❌ خطأ: توكن البوت غير موجود في ملف config.js');
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
    dbName: 'TradingPro'
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
    tradeAmount: { type: Number, default: 1.2 }, // تم التعديل إلى 1.2
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

// ==================== التأكد من إنشاء المجموعة (محسّن) ====================
mongoose.connection.once('open', async () => {
    try {
        console.log('🔍 جاري التحقق من مجموعة users...');
        
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
});

// ==================== القائمة الرئيسية ====================
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [
                { text: "🚀 فتح البوت", web_app: { url: config.WEBAPP_URL } },
                { text: "📊 السوق" }
            ],
            [
                { text: "💰 رصيدي" },
                { text: "📈 أرباحي" }
            ],
            [
                { text: "⚙️ الإعدادات" },
                { text: "❓ المساعدة" }
            ],
            [
                { text: "🔄 تشغيل البوت" },
                { text: "🛑 إيقاف البوت" }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        selective: true
    }
};

// ==================== أوامر البوت ====================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';
    const username = msg.from.username || '';
    
    try {
        const user = await User.findOneAndUpdate(
            { telegramId },
            { 
                $set: { 
                    firstName, 
                    username, 
                    lastActive: new Date() 
                },
                $setOnInsert: { 
                    telegramId, 
                    createdAt: new Date(),
                    favoriteSymbols: [],
                    tradeAmount: 1.2 // تأكيد القيمة الافتراضية
                }
            },
            { upsert: true, new: true }
        );

        console.log(`✅ مستخدم ${user ? 'موجود' : 'جديد'}: ${firstName} - ${telegramId}`);

        const welcomeMessage = `
🌟 *مرحباً بك ${firstName} في بوت التداول الذكي!* 🌟

╔════════════════════╗
║   🚀 *TRADING PRO*   ║
╚════════════════════╝

📊 *معلومات حسابك:*
• ✅ تم حفظ بياناتك في قاعدة البيانات
• 💰 إجمالي الأرباح: *${user.totalProfit} USDT*
• ⭐ عدد المفضلة: *${user.favoriteSymbols.length}*
• 💵 مبلغ التداول: *${user.tradeAmount} USDT*
• 🔄 حالة البوت: ${user.isRunning ? '✅ يعمل' : '⏸️ متوقف'}

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

// ==================== معالج الأزرار النصية ====================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const telegramId = msg.from.id.toString();

    if (text.startsWith('/')) return;

    try {
        const user = await User.findOne({ telegramId });
        
        if (!user && text !== '🚀 فتح البوت') {
            return bot.sendMessage(chatId, '❌ الرجاء إرسال /start أولاً');
        }

        switch(text) {
            case '🚀 فتح البوت':
                await bot.sendMessage(chatId, '🚀 جاري فتح البوت...', {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "🌟 اضغط لفتح التطبيق", web_app: { url: config.WEBAPP_URL } }
                        ]]
                    }
                });
                break;

            case '📊 السوق':
                try {
                    const exchange = new ccxt.bingx();
                    const tickers = await exchange.fetchTickers(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
                    
                    const marketMessage = `
📊 *حالة السوق الآن:*

₿ *BTC/USDT*: $${tickers['BTC/USDT'].last?.toFixed(2) || '0'}
📈 24h: ${tickers['BTC/USDT'].percentage?.toFixed(2) || '0'}%

⟠ *ETH/USDT*: $${tickers['ETH/USDT'].last?.toFixed(2) || '0'}
📈 24h: ${tickers['ETH/USDT'].percentage?.toFixed(2) || '0'}%

◎ *SOL/USDT*: $${tickers['SOL/USDT'].last?.toFixed(2) || '0'}
📈 24h: ${tickers['SOL/USDT'].percentage?.toFixed(2) || '0'}%
                    `;
                    
                    await bot.sendMessage(chatId, marketMessage, { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    });
                } catch (error) {
                    await bot.sendMessage(chatId, '❌ خطأ في جلب بيانات السوق', mainKeyboard);
                }
                break;

            case '💰 رصيدي':
                const exchangeName = user?.selectedExchange || 'bingx';
                
                let balanceText = `💰 *رصيدك الحالي:*\n\n`;
                balanceText += `المنصة النشطة: *${exchangeName.toUpperCase()}*\n`;
                balanceText += `الربح/الخسارة: *${user?.totalProfit || 0} USDT*\n`;
                balanceText += `عدد الصفقات: *${user?.totalTrades || 0}*\n`;
                balanceText += `نسبة النجاح: *${user?.winRate || 0}%*\n`;
                balanceText += `مبلغ التداول: *${user?.tradeAmount || 1.2} USDT*\n`;
                balanceText += `حالة البوت: ${user?.isRunning ? '✅ يعمل' : '⏸️ متوقف'}`;
                
                await bot.sendMessage(chatId, balanceText, { 
                    parse_mode: 'Markdown',
                    ...mainKeyboard 
                });
                break;

            case '📈 أرباحي':
                const profitStats = `
📊 *إحصائيات الأرباح:*

💰 إجمالي الربح: *${user?.totalProfit || 0} USDT*
🔄 عدد الصفقات: *${user?.totalTrades || 0}*
📊 نسبة النجاح: *${user?.winRate || 0}%*
⭐ العملات المفضلة: *${user?.favoriteSymbols?.length || 0}*
💵 مبلغ التداول: *${user?.tradeAmount || 1.2} USDT*

${user?.isRunning ? '✅ البوت يعمل حالياً' : '⏸️ البوت متوقف'}
                `;
                
                await bot.sendMessage(chatId, profitStats, { 
                    parse_mode: 'Markdown',
                    ...mainKeyboard 
                });
                break;

            case '⚙️ الإعدادات':
                await bot.sendMessage(chatId, 
                    `⚙️ *الإعدادات*\n\n` +
                    `• مفاتيح API للمنصات\n` +
                    `• اختيار المنصة النشطة\n` +
                    `• مبلغ التداول (حالياً: ${user?.tradeAmount || 1.2} USDT)\n\n` +
                    `افتح البوت لتعديل الإعدادات`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "⚙️ فتح الإعدادات", web_app: { url: config.WEBAPP_URL } }
                            ]]
                        }
                    }
                );
                break;

            case '❓ المساعدة':
                await bot.sendMessage(chatId,
                    `❓ *المساعدة*\n\n` +
                    `*الأوامر:*\n` +
                    `• /start - القائمة الرئيسية\n` +
                    `• /balance - الرصيد\n` +
                    `• /stop - إيقاف البوت\n\n` +
                    `*الإعدادات:*\n` +
                    `• مبلغ التداول: ${user?.tradeAmount || 1.2} USDT\n` +
                    `• المنصة: ${user?.selectedExchange || 'bingx'}\n\n` +
                    `للاستفسار: ${config.SUPPORT_CHAT}`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🔄 تشغيل البوت':
                await User.findOneAndUpdate(
                    { telegramId }, 
                    { isRunning: true }
                );
                await bot.sendMessage(chatId,
                    `✅ *تم تشغيل البوت*\n\n` +
                    `سيبدأ البحث عن فرص تداول فوراً`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🛑 إيقاف البوت':
                await User.findOneAndUpdate(
                    { telegramId }, 
                    { isRunning: false }
                );
                await bot.sendMessage(chatId,
                    `🛑 *تم إيقاف البوت*`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            default:
                await bot.sendMessage(chatId,
                    `❓ الأمر غير معروف\n` +
                    `استخدم الأزرار في القائمة`,
                    mainKeyboard
                );
        }
    } catch (error) {
        console.error('خطأ في معالج الرسائل:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ، حاول مرة أخرى', mainKeyboard);
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
        
        try {
            const ExchangeClass = ccxt[user.selectedExchange];
            if (!ExchangeClass) {
                return res.json({ success: false, balance: 0 });
            }
            
            const exchange = new ExchangeClass({
                apiKey: user.exchanges[user.selectedExchange]?.apiKey,
                secret: user.exchanges[user.selectedExchange]?.apiSecret,
                timeout: 30000,
                enableRateLimit: true
            });
            
            const balance = await exchange.fetchBalance();
            const usdtBalance = balance.USDT?.free || 0;
            
            res.json({ 
                success: true, 
                balance: usdtBalance,
                exchange: user.selectedExchange
            });
            
        } catch (exchangeError) {
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
        
        const exists = user.favoriteSymbols.some(f => f.symbol === symbol);
        
        if (!exists) {
            user.favoriteSymbols.push({
                symbol,
                exchange: user.selectedExchange,
                lastActive: new Date()
            });
            user.tradeAmount = amount || 1.2;
            await user.save();
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
        
        user.exchanges[exchange].apiKey = apiKey;
        user.exchanges[exchange].apiSecret = apiSecret;
        user.exchanges[exchange].isActive = true;
        
        await user.save();
        
        res.json({ success: true, message: '✅ تم حفظ المفاتيح بنجاح' });
        
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

// ==================== API تشغيل البوت ====================
app.post("/api/start-bot", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        const exists = user.favoriteSymbols.some(f => f.symbol === symbol);
        
        if (!exists) {
            user.favoriteSymbols.push({
                symbol,
                exchange: user.selectedExchange,
                lastActive: new Date()
            });
        }
        
        user.activeSymbol = symbol;
        user.tradeAmount = amount || 1.2;
        user.isRunning = true;
        
        await user.save();
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API جلب جميع العملات المتاحة ====================
app.get("/api/available-symbols", async (req, res) => {
    try {
        const exchange = new ccxt.bingx();
        const markets = await exchange.loadMarkets();
        
        // جلب جميع العملات بدون تعديل (نفس الكود القديم)
        const usdtPairs = Object.keys(markets)
            .filter(symbol => symbol.endsWith('/USDT'))
            .sort();
        
        res.json({ 
            success: true, 
            symbols: usdtPairs,
            total: usdtPairs.length
        });
        
    } catch (error) {
        console.error('خطأ في جلب العملات:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            symbols: [] 
        });
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
        time: new Date().toISOString(),
        version: '5.0.0'
    });
});

// ==================== نظام إبقاء السيرفر نشطاً ====================
function startKeepAlive() {
    const https = require('https');
    const url = config.WEBAPP_URL;
    
    setInterval(() => {
        https.get(url, (res) => {
            console.log(`✅ Ping - ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {});
        
    }, 5 * 60 * 1000);
}

// ==================== تشغيل الخادم ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📁 قاعدة البيانات: TradingPro`);
    console.log(`📱 البوت: https://t.me/${config.BOT_USERNAME}`);
    console.log(`💵 مبلغ التداول الافتراضي: 1.2 USDT`);
    console.log(`⚡ الحالة: جاهز للعمل`);
    
    startKeepAlive();
});

process.on('SIGINT', () => {
    console.log('🛑 جاري إغلاق البوت...');
    bot.stopPolling();
    mongoose.connection.close();
    process.exit();
});