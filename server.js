// ==================== بوت التداول الذكي - النسخة الكاملة مع استراتيجية MA ====================

const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const ccxt = require('ccxt');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

// ==================== الاتصال بقاعدة البيانات ====================
mongoose.connect(config.MONGO_URL)
    .then(() => console.log('✅ متصل بقاعدة البيانات'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==================== نموذج المستخدم ====================
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    apiKey: { type: String, default: '' },
    apiSecret: { type: String, default: '' },
    activeSymbol: { type: String, default: 'BTC/USDT' },
    tradeAmount: { type: Number, default: 10 },
    isRunning: { type: Boolean, default: false },
    totalProfit: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    
    // العملات المفضلة
    favoriteSymbols: [{
        symbol: String,
        lastActive: { type: Date, default: Date.now },
        totalTrades: { type: Number, default: 0 },
        profit: { type: Number, default: 0 }
    }],
    
    // حقل للصفقة الحالية
    currentTrade: {
        symbol: String,
        entryPrice: Number,
        takeProfit: Number,
        stopLoss: Number,
        entryTime: Date,
        entryCandleIndex: Number,
        orderId: String,
        status: { type: String, enum: ['open', 'closed'], default: 'closed' }
    },
    
    // سجل الصفقات
    tradeHistory: [{
        symbol: String,
        entryPrice: Number,
        exitPrice: Number,
        profit: Number,
        profitPercent: Number,
        entryTime: Date,
        exitTime: Date,
        reason: String
    }],
    
    lastTradeTime: Date,
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

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
    const lastName = msg.from.last_name || '';
    
    try {
        await User.findOneAndUpdate(
            { telegramId },
            { 
                telegramId,
                username,
                firstName,
                lastName,
                lastActive: new Date()
            },
            { upsert: true }
        );

        const welcomeMessage = `
🌟 *مرحباً بك ${firstName} في بوت التداول الذكي!* 🌟

╔════════════════════╗
║   🚀 *TRADING OS*    ║
╚════════════════════╝

📊 *مميزات البوت:*
• ✅ تداول آلي 24/7 على BingX
• ✅ استراتيجية MA مع شمعتين خضر
• ✅ ربح/خسارة 0.25% لكل صفقة
• ✅ إدارة مخاطر ذكية

💰 *الخدمات المتاحة:*
• تداول فوري بدون تدخل يدوي
• إشعارات فورية بالصفقات
• تقارير أداء يومية

⚠️ *تنبيه هام:*
التداول بالعملات الرقمية ينطوي على مخاطر عالية

⬇️ *اختر من القائمة أدناه:* ⬇️
        `;

        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...mainKeyboard
        });

        await bot.sendMessage(chatId, '🚀 *روابط سريعة:*', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📱 فتح التطبيق", web_app: { url: config.WEBAPP_URL } },
                        { text: "📞 الدعم الفني", url: config.SUPPORT_CHAT }
                    ],
                    [
                        { text: "📊 حالة السوق", callback_data: "market_status" },
                        { text: "ℹ️ عن البوت", callback_data: "about" }
                    ]
                ]
            }
        });

        console.log(`✅ مستخدم جديد: ${firstName} (@${username}) - ${telegramId}`);

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

🔍 لمزيد من التفاصيل، افتح البوت
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
                const user = await User.findOne({ telegramId });
                await bot.sendMessage(chatId, 
                    `💰 *رصيدك الحالي:*\n\n` +
                    `الربح/الخسارة: *${user?.totalProfit || 0} USDT*\n` +
                    `عدد الصفقات: *${user?.totalTrades || 0}*\n` +
                    `نسبة النجاح: *${user?.winRate || 0}%*\n` +
                    `حالة البوت: ${user?.isRunning ? '✅ يعمل' : '⏸️ متوقف'}\n` +
                    `الزوج النشط: ${user?.activeSymbol || 'غير محدد'}`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '📈 أرباحي':
                const userProfit = await User.findOne({ telegramId });
                
                const profitStats = `
📊 *إحصائيات الأرباح:*

💰 إجمالي الربح: *${userProfit?.totalProfit || 0} USDT*
🔄 عدد الصفقات: *${userProfit?.totalTrades || 0}*
📊 نسبة النجاح: *${userProfit?.winRate || 0}%*
⭐ العملات المفضلة: *${userProfit?.favoriteSymbols?.length || 0}*

${userProfit?.isRunning ? '✅ البوت يعمل حالياً' : '⏸️ البوت متوقف'}
                `;
                
                await bot.sendMessage(chatId, profitStats, { 
                    parse_mode: 'Markdown',
                    ...mainKeyboard 
                });
                break;

            case '⚙️ الإعدادات':
                await bot.sendMessage(chatId, 
                    `⚙️ *الإعدادات*\n\n` +
                    `يمكنك تعديل الإعدادات التالية:\n` +
                    `• مفاتيح API (مطلوبة للتداول)\n` +
                    `• العملة النشطة\n` +
                    `• مبلغ التداول\n\n` +
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
                    `❓ *المساعدة والدعم*\n\n` +
                    `*الأوامر المتاحة:*\n` +
                    `• /start - عرض القائمة الرئيسية\n` +
                    `• /balance - عرض الرصيد\n` +
                    `• /stop - إيقاف البوت\n` +
                    `• /status - حالة البوت\n\n` +
                    `*كيفية الاستخدام:*\n` +
                    `1️⃣ أضف مفاتيح API من BingX\n` +
                    `2️⃣ اختر العملة والمبلغ\n` +
                    `3️⃣ شغّل البوت\n\n` +
                    `*الاستراتيجية:*\n` +
                    `• الدخول: شمعتين خضر فوق MA\n` +
                    `• الخروج: 0.25% ربح/خسارة أو 3 شموع\n\n` +
                    `للاستفسار: ${config.SUPPORT_CHAT}`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🔄 تشغيل البوت':
                await User.findOneAndUpdate({ telegramId }, { isRunning: true });
                await bot.sendMessage(chatId,
                    `✅ *تم تشغيل البوت*\n\n` +
                    `سيبدأ البحث عن فرص تداول في الدورة القادمة`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🛑 إيقاف البوت':
                await User.findOneAndUpdate({ telegramId }, { isRunning: false });
                await bot.sendMessage(chatId,
                    `🛑 *تم إيقاف البوت بنجاح*`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            default:
                await bot.sendMessage(chatId,
                    `❓ الأمر غير معروف\n` +
                    `استخدم الأزرار في القائمة أو أرسل /start`,
                    mainKeyboard
                );
        }
    } catch (error) {
        console.error('خطأ في معالج الرسائل:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ، حاول مرة أخرى', mainKeyboard);
    }
});

// ==================== معالج الأزرار المضمنة ====================

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
        await bot.answerCallbackQuery(callbackQuery.id);

        switch(data) {
            case 'market_status':
                try {
                    const exchange = new ccxt.bingx();
                    const btc = await exchange.fetchTicker('BTC/USDT');
                    
                    await bot.sendMessage(chatId,
                        `📊 *حالة السوق التفصيلية:*\n\n` +
                        `₿ *BTC/USDT*\n` +
                        `السعر: $${btc.last?.toFixed(2) || '0'}\n` +
                        `أعلى: $${btc.high?.toFixed(2) || '0'}\n` +
                        `أدنى: $${btc.low?.toFixed(2) || '0'}\n` +
                        `الحجم: $${(btc.quoteVolume / 1000000).toFixed(2)}M\n` +
                        `التغيير: ${btc.percentage?.toFixed(2) || '0'}%`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (error) {
                    await bot.sendMessage(chatId, '❌ خطأ في جلب البيانات');
                }
                break;

            case 'about':
                await bot.sendMessage(chatId,
                    `ℹ️ *عن البوت*\n\n` +
                    `*الاسم:* Trading OS\n` +
                    `*الإصدار:* 3.0.0\n` +
                    `*الاستراتيجية:* MA + شمعتين خضر\n` +
                    `*الهدف:* 0.25% ربح/خسارة\n\n` +
                    `*المطور:* Trading OS Team`,
                    { parse_mode: 'Markdown' }
                );
                break;
        }

    } catch (error) {
        console.error('خطأ في معالج الأزرار:', error);
    }
});

// ==================== أوامر إضافية ====================

bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    const user = await User.findOne({ telegramId });
    await bot.sendMessage(chatId,
        `💰 *رصيدك:* ${user?.totalProfit || 0} USDT`,
        { 
            parse_mode: 'Markdown',
            ...mainKeyboard 
        }
    );
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    await User.findOneAndUpdate({ telegramId }, { isRunning: false });
    await bot.sendMessage(chatId, '🛑 تم إيقاف البوت', mainKeyboard);
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    const user = await User.findOne({ telegramId });
    
    if (user?.isRunning) {
        const tradeStatus = user.currentTrade?.status === 'open' ? 
            `🟢 صفقة مفتوحة على ${user.currentTrade.symbol}` : 
            '⚪ لا توجد صفقة مفتوحة';
            
        await bot.sendMessage(chatId,
            `✅ *البوت يعمل*\n` +
            `الزوج النشط: ${user.activeSymbol}\n` +
            `المبلغ: ${user.tradeAmount} USDT\n` +
            `الربح: ${user.totalProfit} USDT\n` +
            `${tradeStatus}`,
            { 
                parse_mode: 'Markdown',
                ...mainKeyboard 
            }
        );
    } else {
        await bot.sendMessage(chatId, '⏸️ البوت متوقف', mainKeyboard);
    }
});

// ==================== APIs ====================

app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ results: [], balance: 0, isRunning: false });
        }

        const exchange = new ccxt.bingx();
        let results = [];

        const symbolsToScan = user.favoriteSymbols?.length > 0 
            ? user.favoriteSymbols.map(f => f.symbol)
            : (user.activeSymbol ? [user.activeSymbol] : []);

        if (symbolsToScan.length === 0) {
            return res.json({ 
                results: [], 
                balance: user.totalProfit || 0,
                isRunning: user.isRunning || false,
                activeSymbol: user.activeSymbol
            });
        }

        for (let sym of symbolsToScan) {
            try {
                const ohlcv = await exchange.fetchOHLCV(sym, '15m', undefined, 30);
                const prices = ohlcv.map(x => x[4]);
                const current = prices[prices.length - 1];
                
                // حساب SMA 20
                const sma = calculateSMA(prices, 20);
                const currentSMA = sma[sma.length - 1] || 0;
                
                // آخر شمعتين
                const lastTwoCandles = ohlcv.slice(-2);
                const candle1Green = lastTwoCandles[0] && lastTwoCandles[0][4] > lastTwoCandles[0][1];
                const candle2Green = lastTwoCandles[1] && lastTwoCandles[1][4] > lastTwoCandles[1][1];
                
                let signal = 'WAIT';
                if (candle1Green && candle2Green && current > currentSMA) signal = 'BUY';

                const isActive = user.isRunning && user.activeSymbol === sym;

                results.push({
                    symbol: sym,
                    price: current.toFixed(2),
                    sma: currentSMA.toFixed(2),
                    signal: signal,
                    change: ((current - prices[0]) / prices[0] * 100).toFixed(2),
                    isActive: isActive,
                    lastActive: user.favoriteSymbols?.find(f => f.symbol === sym)?.lastActive
                });
            } catch (e) {
                console.log(`خطأ في جلب بيانات ${sym}:`, e.message);
            }
        }

        results.sort((a, b) => {
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return 0;
        });
        
        res.json({ 
            results, 
            balance: user.totalProfit || 0,
            isRunning: user.isRunning || false,
            activeSymbol: user.activeSymbol,
            currentTrade: user.currentTrade
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.post("/api/save-keys", async (req, res) => {
    try {
        const { telegramId, apiKey, apiSecret } = req.body;
        
        if (!telegramId || !apiKey || !apiSecret) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        await User.findOneAndUpdate(
            { telegramId }, 
            { apiKey, apiSecret }, 
            { upsert: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/start-bot", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        if (!telegramId || !symbol || !amount) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ telegramId });
        
        if (user) {
            const exists = user.favoriteSymbols?.some(f => f.symbol === symbol);
            
            if (!exists) {
                await User.findOneAndUpdate(
                    { telegramId },
                    { 
                        $push: { 
                            favoriteSymbols: { 
                                symbol: symbol, 
                                lastActive: new Date(),
                                totalTrades: 0,
                                profit: 0
                            } 
                        }
                    }
                );
            } else {
                await User.findOneAndUpdate(
                    { 
                        telegramId, 
                        "favoriteSymbols.symbol": symbol 
                    },
                    { 
                        $set: { "favoriteSymbols.$.lastActive": new Date() }
                    }
                );
            }
        }
        
        await User.findOneAndUpdate(
            { telegramId }, 
            { 
                activeSymbol: symbol, 
                tradeAmount: amount, 
                isRunning: true 
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        res.json(user || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/available-symbols", async (req, res) => {
    try {
        const exchange = new ccxt.bingx();
        const markets = await exchange.loadMarkets();
        
        const usdtPairs = Object.keys(markets)
            .filter(symbol => symbol.endsWith('/USDT'))
            .map(symbol => ({
                symbol: symbol,
                base: symbol.split('/')[0],
                quote: 'USDT',
                active: markets[symbol].active
            }))
            .sort((a, b) => a.base.localeCompare(b.base));
        
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

// ==================== إضافة مسار الصحة (Health Check) ====================

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        time: new Date().toISOString(),
        uptime: process.uptime(),
        version: '3.0.0'
    });
});

// ==================== دوال التداول ====================

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

async function findNewTradeOpportunity(user, exchange) {
    const favoriteSymbols = user.favoriteSymbols?.map(f => f.symbol) || [];
    
    if (user.activeSymbol && !favoriteSymbols.includes(user.activeSymbol)) {
        favoriteSymbols.push(user.activeSymbol);
    }

    for (const symbol of favoriteSymbols) {
        try {
            const ohlcv = await exchange.fetchOHLCV(symbol, '15m', undefined, 30);
            
            if (ohlcv.length < 5) continue;

            const prices = ohlcv.map(c => c[4]);
            const sma = calculateSMA(prices, 20);
            const currentSMA = sma[sma.length - 1];

            // آخر 3 شموع
            const lastThreeCandles = ohlcv.slice(-3);
            
            if (lastThreeCandles.length >= 3) {
                const candle2 = lastThreeCandles[1]; // قبل الأخيرة
                const candle3 = lastThreeCandles[2]; // الأخيرة

                const candle2Green = candle2[4] > candle2[1]; // إغلاق > فتح
                const candle3Green = candle3[4] > candle3[1];
                const aboveSMA = candle3[4] > currentSMA;

                if (candle2Green && candle3Green && aboveSMA) {
                    const lastTradeCheck = user.lastTradeTime ? 
                        new Date(user.lastTradeTime).getTime() : 0;
                    
                    if (Date.now() - lastTradeCheck < 60 * 1000) {
                        continue;
                    }

                    await openNewTrade(user, symbol, candle3[4], currentSMA, exchange);
                    return true;
                }
            }
        } catch (symbolError) {
            console.log(`خطأ في فحص ${symbol}:`, symbolError.message);
        }
    }
    return false;
}

async function openNewTrade(user, symbol, entryPrice, sma, exchange) {
    const takeProfit = entryPrice * 1.0025; // +0.25%
    const stopLoss = entryPrice * 0.9975;   // -0.25%
    
    console.log(`🟢 فتح صفقة جديدة لـ ${user.telegramId} على ${symbol}`);
    console.log(`   السعر: ${entryPrice}, TP: ${takeProfit}, SL: ${stopLoss}`);
    
    let orderId = null;
    
    try {
        const balance = await exchange.fetchBalance();
        const usdtBalance = balance.USDT?.free || 0;
        const amount = Math.min(user.tradeAmount || 10, usdtBalance);
        
        if (amount >= 5) {
            const order = await exchange.createMarketBuyOrder(
                symbol,
                amount / entryPrice
            );
            orderId = order.id;
            console.log(`✅ أمر شراء منفذ:`, order.id);
        }
    } catch (orderError) {
        console.error(`❌ فشل تنفيذ أمر الشراء:`, orderError.message);
    }
    
    await User.findOneAndUpdate(
        { telegramId: user.telegramId },
        {
            $set: {
                currentTrade: {
                    symbol: symbol,
                    entryPrice: entryPrice,
                    takeProfit: takeProfit,
                    stopLoss: stopLoss,
                    entryTime: new Date(),
                    entryCandleIndex: 0,
                    orderId: orderId,
                    status: 'open'
                },
                lastTradeTime: new Date()
            }
        }
    );

    const message = `
🟢 *صفقة جديدة - ${symbol}*

📊 *تفاصيل الدخول:*
• سعر الشراء: $${entryPrice.toFixed(2)}
• المتوسط المتحرك: $${sma.toFixed(2)}
• شمعتين خضر فوق MA ✅

🎯 *الأهداف:*
• ✅ ربح: $${takeProfit.toFixed(2)} (0.25%)
• ❌ خسارة: $${stopLoss.toFixed(2)} (0.25%)
• ⏱️ حد أقصى: 3 شموع

⏰ الوقت: ${new Date().toLocaleString('ar-EG')}
    `;
    
    await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
}

async function handleOpenTrade(user, exchange) {
    const trade = user.currentTrade;
    
    try {
        const ohlcv = await exchange.fetchOHLCV(trade.symbol, '15m', undefined, 2);
        const currentCandle = ohlcv[ohlcv.length - 1];
        
        const highPrice = currentCandle[2];
        const lowPrice = currentCandle[3];
        const closePrice = currentCandle[4];
        
        const entryTime = new Date(trade.entryTime).getTime();
        const currentTime = new Date().getTime();
        const candlesPassed = Math.floor((currentTime - entryTime) / (15 * 60 * 1000));
        
        let exitReason = '';
        let exitPrice = closePrice;
        let shouldExit = false;

        if (highPrice >= trade.takeProfit) {
            shouldExit = true;
            exitReason = '✅ تحقيق ربح 0.25%';
            exitPrice = trade.takeProfit;
        }
        else if (lowPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = '❌ وقف خسارة 0.25%';
            exitPrice = trade.stopLoss;
        }
        else if (candlesPassed >= 3) {
            shouldExit = true;
            exitReason = '⏱️ إغلاق الشمعة الثالثة';
            exitPrice = closePrice;
        }

        if (shouldExit) {
            await closeTrade(user, exitPrice, exitReason, exchange);
        }
        
    } catch (error) {
        console.error(`خطأ في مراقبة صفقة ${user.telegramId}:`, error.message);
    }
}

async function closeTrade(user, exitPrice, reason, exchange) {
    const trade = user.currentTrade;
    
    try {
        if (trade.orderId) {
            const balance = await exchange.fetchBalance();
            const symbolBase = trade.symbol.split('/')[0];
            const cryptoBalance = balance[symbolBase]?.free || 0;
            
            if (cryptoBalance > 0) {
                await exchange.createMarketSellOrder(
                    trade.symbol,
                    cryptoBalance
                );
            }
        }
    } catch (orderError) {
        console.error(`❌ فشل تنفيذ أمر البيع:`, orderError.message);
    }
    
    const profitPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
    const profitAmount = (user.tradeAmount || 10) * (profitPercent / 100);
    
    const newTotalProfit = (user.totalProfit || 0) + profitAmount;
    const newTotalTrades = (user.totalTrades || 0) + 1;
    
    // تحديث نسبة النجاح
    const tradeHistory = user.tradeHistory || [];
    const winCount = tradeHistory.filter(t => t.profit > 0).length + (profitPercent > 0 ? 1 : 0);
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
                    exitPrice: exitPrice,
                    profit: profitAmount,
                    profitPercent: profitPercent,
                    entryTime: trade.entryTime,
                    exitTime: new Date(),
                    reason: reason
                }
            }
        }
    );

    const emoji = profitPercent > 0 ? '✅' : '❌';
    const message = `
${emoji} *صفقة مغلقة - ${trade.symbol}*

📊 *النتيجة:*
• سعر الدخول: $${trade.entryPrice.toFixed(2)}
• سعر الخروج: $${exitPrice.toFixed(2)}
• الربح/الخسارة: ${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%
• المبلغ: $${Math.abs(profitAmount).toFixed(2)} USDT

📝 السبب: ${reason}
💰 إجمالي الأرباح: $${newTotalProfit.toFixed(2)} USDT
📊 نسبة النجاح: ${newWinRate.toFixed(1)}%

⏰ الوقت: ${new Date().toLocaleString('ar-EG')}
    `;
    
    await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
}

// ==================== نظام إبقاء السيرفر نشطاً ====================

function startKeepAlive() {
    const https = require('https');
    const url = process.env.WEBAPP_URL || `https://trading-os-bot.onrender.com`;
    
    console.log('🔄 بدء نظام إبقاء السيرفر نشطاً...');
    console.log(`📡 عنوان السيرفر: ${url}`);
    
    setInterval(() => {
        const startTime = Date.now();
        
        https.get(url, (res) => {
            const duration = Date.now() - startTime;
            console.log(`✅ Ping ناجح - ${res.statusCode} - استغرق ${duration}ms - ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {
            console.log(`❌ Ping فشل - ${err.message} - ${new Date().toLocaleTimeString()}`);
        });
        
        // Ping إضافي لمسار الصحة
        setTimeout(() => {
            https.get(`${url}/health`, (res) => {
                console.log(`✅ Health check: ${res.statusCode}`);
            }).on('error', () => {});
        }, 1000);
        
    }, 5 * 60 * 1000); // كل 5 دقائق
}

// ==================== نظام التداول الآلي ====================

async function executeTrading() {
    console.log('🔍 جاري فحص فرص التداول - استراتيجية 0.25%...');
    
    try {
        const users = await User.find({ isRunning: true, apiKey: { $exists: true, $ne: '' } });
        
        for (const user of users) {
            try {
                if (!user.apiKey || !user.apiSecret) continue;

                const exchange = new ccxt.bingx({
                    apiKey: user.apiKey,
                    secret: user.apiSecret,
                    options: { defaultType: 'spot' }
                });

                if (user.currentTrade?.status === 'open') {
                    await handleOpenTrade(user, exchange);
                }

                const hasOpenTrade = user.currentTrade?.status === 'open';
                
                if (!hasOpenTrade) {
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

// تشغيل التداول كل 15 دقيقة
setInterval(executeTrading, 15 * 60 * 1000);

// ==================== تشغيل الخادم ====================

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 افتح البوت: https://t.me/${config.BOT_USERNAME}`);
    console.log(`⏱️ استراتيجية MA مع شمعتين خضر - ربح/خسارة 0.25%`);
    console.log(`🏥 مسار الصحة: /health`);
    
    // شغل نظام إبقاء السيرفر نشطاً
    startKeepAlive();
});

// إغلاق نظيف
process.on('SIGINT', () => {
    console.log('🛑 جاري إغلاق البوت...');
    bot.stopPolling();
    mongoose.connection.close();
    process.exit();
});