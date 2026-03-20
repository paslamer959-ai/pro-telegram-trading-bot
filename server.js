// ==================== بوت التداول الذكي - النسخة الكاملة مع جميع الميزات ====================

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
    tradeAmount: { type: Number, default: 1.2 },
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
                { text: "🚀 فتح البوت", web_app: { url: config.web_app: { url: config.WEBAPP_URL } },
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
                    tradeAmount: 1.2
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

📈 *استراتيجية التداول:*
• شمعتين خضر متتاليتين فوق SMA 20
• RSI أقل من 70
• ربح/خسارة 0.25% أو 45 دقيقة

⬇️ *اضغط على الزر أدناه لفتح التطبيق:* ⬇️
        `;

        // إرسال رسالة الترحيب
        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...mainKeyboard
        });

        // إرسال زر فتح التطبيق مباشرة أسفل الرسالة
        await bot.sendMessage(chatId, '🚀 *فتح التطبيق المصغر*', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🌟 اضغط هنا لفتح التطبيق", web_app: { url: config.WEBAPP_URL } }]
                ]
            }
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
                    `• مبلغ التداول (حالياً: ${user?.tradeAmount || 1.2} USDT)\n` +
                    `• استراتيجية: شمعتين خضر + SMA + RSI\n\n` +
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
                    `*الاستراتيجية:*\n` +
                    `• شمعتين خضر متتاليتين فوق SMA 20\n` +
                    `• RSI أقل من 70\n` +
                    `• ربح 0.25% أو خسارة 0.25% أو 45 دقيقة\n\n` +
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
                    `سيبدأ البحث عن فرص تداول فوراً باستخدام استراتيجية الشمعتين الخضر`,
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

// ==================== API المسارات ====================

// API جلب بيانات المستخدم
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

// API جلب الرصيد الحقيقي
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

// API إضافة للمفضلة
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

// API حذف من المفضلة (جديد)
app.post("/api/remove-from-favorites", async (req, res) => {
    try {
        const { telegramId, symbol } = req.body;
        
        if (!telegramId || !symbol) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        user.favoriteSymbols = user.favoriteSymbols.filter(f => f.symbol !== symbol);
        await user.save();
        
        res.json({ success: true, message: `✅ تم حذف ${symbol} من المفضلة` });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API حفظ مفاتيح API
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

// API تغيير المنصة النشطة
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

// API جلب بيانات السوق
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

// API تشغيل البوت
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

// API جلب جميع العملات المتاحة
app.get("/api/available-symbols", async (req, res) => {
    try {
        const exchange = new ccxt.bingx();
        const markets = await exchange.loadMarkets();
        
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

// ==================== دوال المؤشرات الفنية ====================

// حساب المتوسط المتحرك البسيط (SMA)
function calculateSMA(prices, period) {
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += prices[i - j];
        }
        sma.push(sum / period);
    }
    return sma;
}

// حساب RSI (مؤشر القوة النسبية)
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return [50];
    
    const gains = [];
    const losses = [];

    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rsi = [];
    
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        rsi.push(rsiValue);
    }
    
    return rsi;
}

// ==================== دالة إنشاء اتصال بالمنصة ====================
async function getExchangeConnection(user) {
    const exchangeName = user.selectedExchange || 'bingx';
    const exchangeConfig = user.exchanges[exchangeName];
    
    if (!exchangeConfig || !exchangeConfig.apiKey || !exchangeConfig.apiSecret) {
        throw new Error(`❌ مفاتيح ${exchangeName} غير موجودة`);
    }
    
    let exchange;
    
    switch(exchangeName) {
        case 'bingx':
            exchange = new ccxt.bingx({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                timeout: 30000,
                enableRateLimit: true,
                options: { defaultType: 'spot' }
            });
            break;
        case 'binance':
            exchange = new ccxt.binance({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                timeout: 30000,
                enableRateLimit: true,
                options: { defaultType: 'spot' }
            });
            break;
        case 'bybit':
            exchange = new ccxt.bybit({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                timeout: 30000,
                enableRateLimit: true,
                options: { defaultType: 'spot' }
            });
            break;
        case 'mexc':
            exchange = new ccxt.mexc({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                timeout: 30000,
                enableRateLimit: true,
                options: { defaultType: 'spot' }
            });
            break;
        default:
            throw new Error('❌ منصة غير مدعومة');
    }
    
    await exchange.loadMarkets();
    console.log(`✅ متصل بـ ${exchangeName}`);
    
    return exchange;
}

// ==================== دالة فتح صفقة جديدة ====================
async function openNewTrade(user, symbol, entryPrice, sma, exchange) {
    const exchangeName = user.selectedExchange;
    const MIN_TRADE_AMOUNT = 1.20;
    
    try {
        const balance = await exchange.fetchBalance();
        const usdtBalance = balance.USDT?.free || 0;
        
        if (usdtBalance < MIN_TRADE_AMOUNT) {
            console.log(`❌ رصيد غير كاف: ${usdtBalance} USDT`);
            return;
        }
        
        const amountToUse = Math.min(user.tradeAmount || 1.2, usdtBalance * 0.95);
        
        if (amountToUse < MIN_TRADE_AMOUNT) {
            console.log(`❌ المبلغ أقل من الحد الأدنى`);
            return;
        }
        
        const ticker = await exchange.fetchTicker(symbol);
        const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
        
        let targetMultiplier = 1.0025; // 0.25%
        let stopMultiplier = 0.9975;
        
        if (spread > 0.2) {
            targetMultiplier = 1.0035; // 0.35%
            stopMultiplier = 0.9965;
        }
        
        const takeProfit = entryPrice * targetMultiplier;
        const stopLoss = entryPrice * stopMultiplier;
        
        console.log(`🟢 فتح صفقة على ${symbol} بمبلغ ${amountToUse.toFixed(2)} USDT`);
        
        const order = await exchange.createMarketBuyOrder(
            symbol,
            amountToUse / entryPrice
        );
        
        await User.findOneAndUpdate(
            { telegramId: user.telegramId },
            {
                $set: {
                    currentTrade: {
                        symbol,
                        exchange: exchangeName,
                        entryPrice,
                        takeProfit,
                        stopLoss,
                        entryTime: new Date(),
                        orderId: order.id,
                        status: 'open'
                    },
                    lastTradeTime: new Date()
                }
            }
        );

        const message = `
🟢 *صفقة جديدة - ${symbol}*

💰 المبلغ: ${amountToUse.toFixed(2)} USDT
📊 سعر الشراء: $${entryPrice.toFixed(2)}
🎯 الربح: $${takeProfit.toFixed(2)} (0.25%)
🛑 الخسارة: $${stopLoss.toFixed(2)} (0.25%)
📈 SMA: $${sma.toFixed(2)}

⏰ ${new Date().toLocaleString('ar-EG')}
        `;
        
        await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error(`❌ فشل تنفيذ أمر الشراء:`, error.message);
        await bot.sendMessage(user.telegramId, `❌ فشل الشراء: ${error.message}`);
    }
}

// ==================== دالة مراقبة الصفقة المفتوحة ====================
async function handleOpenTrade(user, exchange) {
    const trade = user.currentTrade;
    
    try {
        const ticker = await exchange.fetchTicker(trade.symbol);
        const currentPrice = ticker.last;
        const bidPrice = ticker.bid;
        
        const entryTime = new Date(trade.entryTime).getTime();
        const currentTime = new Date().getTime();
        const minutesPassed = Math.floor((currentTime - entryTime) / (60 * 1000));
        
        let exitReason = '';
        let shouldExit = false;

        if (bidPrice >= trade.takeProfit) {
            shouldExit = true;
            exitReason = '✅ تحقيق الربح 0.25%';
        }
        else if (currentPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = '❌ وقف خسارة 0.25%';
        }
        else if (minutesPassed >= 45) {
            shouldExit = true;
            exitReason = '⏱️ انتهاء الوقت (45 دقيقة)';
        }

        if (shouldExit) {
            await closeTrade(user, currentPrice, exitReason, exchange);
        } else {
            console.log(`👀 مراقبة ${trade.symbol} - السعر: $${currentPrice} | الربح المستهدف: $${trade.takeProfit} | الخسارة: $${trade.stopLoss}`);
        }
        
    } catch (error) {
        console.error(`خطأ في مراقبة الصفقة:`, error.message);
    }
}

// ==================== دالة إغلاق الصفقة ====================
async function closeTrade(user, exitPrice, reason, exchange) {
    const trade = user.currentTrade;
    
    try {
        const balance = await exchange.fetchBalance();
        const symbolBase = trade.symbol.split('/')[0];
        const cryptoBalance = balance[symbolBase]?.free || 0;
        
        if (cryptoBalance > 0) {
            await exchange.createMarketSellOrder(trade.symbol, cryptoBalance);
        }
        
        const profitPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const profitAmount = (user.tradeAmount || 1.2) * (profitPercent / 100);
        
        const newTotalProfit = (user.totalProfit || 0) + profitAmount;
        const newTotalTrades = (user.totalTrades || 0) + 1;
        
        const winCount = (user.tradeHistory?.filter(t => t.profit > 0).length || 0) + (profitPercent > 0 ? 1 : 0);
        const newWinRate = (winCount / newTotalTrades) * 100;
        
        await User.findOneAndUpdate(
            { telegramId: user.telegramId },
            {
                $set: {
                    currentTrade: { status: 'closed' },
                    totalProfit: newTotalProfit,
                    totalTrades: newTotalTrades,
                    winRate: newWinRate
                },
                $push: {
                    tradeHistory: {
                        symbol: trade.symbol,
                        entryPrice: trade.entryPrice,
                        exitPrice,
                        profit: profitAmount,
                        profitPercent,
                        entryTime: trade.entryTime,
                        exitTime: new Date(),
                        reason
                    }
                }
            }
        );

        const emoji = profitPercent > 0 ? '✅' : '❌';
        const message = `
${emoji} *صفقة مغلقة*

📊 ${trade.symbol}
💰 الربح/الخسارة: ${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%
💵 المبلغ: $${Math.abs(profitAmount).toFixed(2)} USDT
📝 السبب: ${reason}
📈 نسبة النجاح: ${newWinRate.toFixed(1)}%

⏰ ${new Date().toLocaleString('ar-EG')}
        `;
        
        await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error(`❌ فشل البيع:`, error.message);
    }
}

// ==================== دالة البحث عن فرص جديدة (الاستراتيجية الرئيسية) ====================
async function findNewTradeOpportunity(user, exchange) {
    const exchangeName = user.selectedExchange;
    const favoriteSymbols = user.favoriteSymbols
        .filter(f => f.exchange === exchangeName)
        .map(f => f.symbol);
    
    if (user.activeSymbol && !favoriteSymbols.includes(user.activeSymbol)) {
        favoriteSymbols.push(user.activeSymbol);
    }

    console.log(`🔍 البحث عن فرص للمستخدم ${user.telegramId} على ${exchangeName}`);

    for (const symbol of favoriteSymbols) {
        try {
            const ohlcv = await exchange.fetchOHLCV(symbol, '15m', undefined, 50);
            if (ohlcv.length < 30) continue;

            const prices = ohlcv.map(c => c[4]);
            const sma = calculateSMA(prices, 20);
            const currentSMA = sma[sma.length - 1];
            const rsi = calculateRSI(prices, 14);
            const currentRSI = rsi[rsi.length - 1];

            const ticker = await exchange.fetchTicker(symbol);
            const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
            if (spread > 0.5) {
                console.log(`⏸️ تجاهل ${symbol} - فرق سعر كبير: ${spread.toFixed(2)}%`);
                continue;
            }

            const lastThreeCandles = ohlcv.slice(-3);
            if (lastThreeCandles.length >= 3) {
                const candle2 = lastThreeCandles[1];
                const candle2Green = candle2[4] > candle2[1];
                
                const candle3 = lastThreeCandles[2];
                const candle3Green = candle3[4] > candle3[1];
                
                const aboveSMA = candle3[4] > currentSMA;

                if (candle2Green && candle3Green && aboveSMA && currentRSI < 70) {
                    console.log(`✅✅✅ فرصة على ${symbol}:`);
                    console.log(`   - شمعتين خضر: ✅`);
                    console.log(`   - فوق SMA 20: ✅ ($${candle3[4].toFixed(2)} > $${currentSMA.toFixed(2)})`);
                    console.log(`   - RSI: ${currentRSI.toFixed(2)} (<70 ✅)`);
                    
                    await openNewTrade(user, symbol, candle3[4], currentSMA, exchange);
                    return true;
                }
            }
        } catch (error) {
            console.log(`خطأ في فحص ${symbol}:`, error.message);
        }
    }
    return false;
}

// ==================== نظام التداول المستمر ====================
async function executeTrading() {
    try {
        const users = await User.find({ isRunning: true });
        
        for (const user of users) {
            try {
                const exchange = await getExchangeConnection(user);

                if (user.currentTrade?.status === 'open') {
                    await handleOpenTrade(user, exchange);
                } else {
                    await findNewTradeOpportunity(user, exchange);
                }
                
            } catch (userError) {
                console.error(`خطأ في المستخدم ${user.telegramId}:`, userError.message);
            }
        }
    } catch (error) {
        console.error('خطأ في نظام التداول:', error);
    }
}

// تشغيل التداول كل 30 ثانية
setInterval(executeTrading, 30 * 1000);

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
        version: '5.0.0',
        strategy: 'Two green candles above SMA 20 with RSI < 70'
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
    console.log(`📈 استراتيجية التداول: شمعتين خضر فوق SMA 20 + RSI < 70`);
    console.log(`🎯 الربح المستهدف: 0.25% | وقف الخسارة: 0.25% | الحد الأقصى: 45 دقيقة`);
    console.log(`🔄 البحث عن فرص: كل 30 ثانية`);
    
    startKeepAlive();
});

process.on('SIGINT', () => {
    console.log('🛑 جاري إغلاق البوت...');
    bot.stopPolling();
    mongoose.connection.close();
    process.exit();
});
