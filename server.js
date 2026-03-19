// ==================== بوت التداول الذكي - النسخة الفائقة السرعة ====================

const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const ccxt = require('ccxt');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ==================== تحسينات الأداء ====================
// تمكين الضغط (Compression) لتسريع الاستجابات
app.use(require('compression')());

// تخزين مؤقت للبيانات (Cache)
const cache = {
    marketData: new Map(),
    balanceData: new Map(),
    lastFetch: new Map()
};

const CACHE_DURATION = 30 * 1000; // 30 ثانية

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
const bot = new TelegramBot(config.BOT_TOKEN, { 
    polling: true,
    // تحسينات لتسريع البوت
    polling: {
        interval: 300, // 300ms بين كل طلب
        autoStart: true,
        params: {
            timeout: 30
        }
    }
});
console.log('✅ البوت يعمل...');

// ==================== الاتصال بقاعدة البيانات ====================
mongoose.connect(config.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // تحسين اتصال MongoDB
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => console.log('✅ متصل بقاعدة البيانات'))
.catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==================== نموذج المستخدم المطور مع المنصات ====================
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: String,
    firstName: String,
    lastName: String,
    
    // المنصة المختارة
    selectedExchange: { 
        type: String, 
        enum: ['bingx', 'binance', 'bybit', 'mexc'], 
        default: 'bingx' 
    },
    
    // مفاتيح المنصات المختلفة
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
    
    // إعدادات التداول
    activeSymbol: { type: String, default: 'BTC/USDT' },
    tradeAmount: { type: Number, default: 10 },
    isRunning: { type: Boolean, default: false },
    totalProfit: { type: Number, default: 0 },
    totalTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    
    // العملات المفضلة
    favoriteSymbols: [{
        symbol: String,
        exchange: { type: String, default: 'bingx' },
        lastActive: { type: Date, default: Date.now },
        totalTrades: { type: Number, default: 0 },
        profit: { type: Number, default: 0 }
    }],
    
    // الصفقة الحالية
    currentTrade: {
        symbol: String,
        exchange: String,
        entryPrice: Number,
        takeProfit: Number,
        stopLoss: Number,
        entryTime: Date,
        orderId: String,
        status: { type: String, enum: ['open', 'closed'], default: 'closed' }
    },
    
    // سجل الصفقات
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
    
    lastTradeTime: Date
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
    
    try {
        await User.findOneAndUpdate(
            { telegramId },
            { 
                telegramId,
                firstName,
                lastActive: new Date()
            },
            { upsert: true }
        );

        const welcomeMessage = `
🌟 *مرحباً بك ${firstName} في بوت التداول الذكي!* 🌟

╔════════════════════╗
║   🚀 *TRADING PRO*   ║
╚════════════════════╝

📊 *مميزات البوت:*
• ✅ دعم 4 منصات: BingX, Binance, Bybit, MEXC
• ✅ استراتيجية MA + RSI + شمعتين خضر
• ✅ بحث فوري عن الفرص
• ✅ ربح/خسارة 0.25% لكل صفقة
• ✅ حد أدنى 1.20 USDT
• ✅ سرعة فائقة في التنفيذ

💰 *الخدمات المتاحة:*
• تداول فوري على المنصة التي تختارها
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

        console.log(`✅ مستخدم جديد: ${firstName} - ${telegramId}`);

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
                const exchangeName = user?.selectedExchange || 'bingx';
                
                let balanceText = `💰 *رصيدك الحالي:*\n\n`;
                balanceText += `المنصة النشطة: *${exchangeName.toUpperCase()}*\n`;
                balanceText += `الربح/الخسارة: *${user?.totalProfit || 0} USDT*\n`;
                balanceText += `عدد الصفقات: *${user?.totalTrades || 0}*\n`;
                balanceText += `نسبة النجاح: *${user?.winRate || 0}%*\n`;
                balanceText += `حالة البوت: ${user?.isRunning ? '✅ يعمل' : '⏸️ متوقف'}`;
                
                await bot.sendMessage(chatId, balanceText, { 
                    parse_mode: 'Markdown',
                    ...mainKeyboard 
                });
                break;

            case '📈 أرباحي':
                const userProfit = await User.findOne({ telegramId });
                
                const profitStats = `
📊 *إحصائيات الأرباح:*

💰 إجمالي الربح: *${userProfit?.totalProfit || 0} USDT*
🔄 عدد الصفقات: *${userProfit?.totalTrades || 0}*
📊 نسبة النجاح: *${userProfit?.winRate || 0}%*
⭐ العملات المفضلة: *${userProfit?.favoriteSymbols?.length || 0}*

${userProfit?.isRunning ? '✅ البوت يعمل' : '⏸️ البوت متوقف'}
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
                    `• مبلغ التداول (حد أدنى 1.20 USDT)\n\n` +
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
                    `• الدخول: شمعتين خضر فوق MA + RSI < 70\n` +
                    `• الخروج: 0.25% ربح/خسارة أو 3 شموع\n` +
                    `• الحد الأدنى: 1.20 USDT\n\n` +
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
                    `سيبدأ البحث عن فرص تداول فوراً`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🛑 إيقاف البوت':
                await User.findOneAndUpdate({ telegramId }, { isRunning: false });
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

// ==================== دوال التداول الأساسية ====================

// دالة حساب SMA
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

// دالة حساب RSI
function calculateRSI(prices, period = 14) {
    const rsi = [];
    const gains = [];
    const losses = [];

    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
        if (i > period) {
            avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
        }

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        rsi.push(rsiValue);
    }

    return rsi;
}

// ==================== دالة إنشاء اتصال بالمنصة مع تحسين الأداء ====================
const exchangeCache = new Map();

async function getExchangeConnection(user) {
    const cacheKey = `${user.telegramId}_${user.selectedExchange}`;
    
    // استخدام الكاش إذا كان الاتصال موجوداً وأقل من 5 دقائق
    if (exchangeCache.has(cacheKey)) {
        const cached = exchangeCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.exchange;
        }
    }
    
    const exchangeName = user.selectedExchange || 'bingx';
    const exchangeConfig = user.exchanges[exchangeName];
    
    if (!exchangeConfig || !exchangeConfig.apiKey || !exchangeConfig.apiSecret) {
        throw new Error(`❌ مفاتيح ${exchangeName} غير موجودة`);
    }
    
    let exchange;
    const options = {
        apiKey: exchangeConfig.apiKey,
        secret: exchangeConfig.apiSecret,
        timeout: 30000, // 30 ثانية مهلة
        enableRateLimit: true,
        options: { defaultType: 'spot' }
    };
    
    switch(exchangeName) {
        case 'bingx':
            exchange = new ccxt.bingx(options);
            break;
        case 'binance':
            exchange = new ccxt.binance(options);
            break;
        case 'bybit':
            exchange = new ccxt.bybit(options);
            break;
        case 'mexc':
            exchange = new ccxt.mexc(options);
            break;
        default:
            throw new Error('❌ منصة غير مدعومة');
    }
    
    await exchange.loadMarkets();
    
    // حفظ في الكاش
    exchangeCache.set(cacheKey, {
        exchange,
        timestamp: Date.now()
    });
    
    console.log(`✅ متصل بـ ${exchangeName} للمستخدم ${user.telegramId}`);
    return exchange;
}

// ==================== دالة فتح صفقة جديدة مع تحسينات ====================
async function openNewTrade(user, symbol, entryPrice, sma, exchange) {
    const exchangeName = user.selectedExchange;
    const MIN_TRADE_AMOUNT = 1.20; // الحد الأدنى 1.20 دولار
    
    try {
        // جلب الرصيد بسرعة
        const balance = await exchange.fetchBalance();
        const usdtBalance = balance.USDT?.free || 0;
        
        // التحقق من الحد الأدنى
        if (usdtBalance < MIN_TRADE_AMOUNT) {
            console.log(`❌ رصيد غير كاف: ${usdtBalance} USDT (الحد الأدنى ${MIN_TRADE_AMOUNT})`);
            await bot.sendMessage(user.telegramId, 
                `❌ رصيد غير كاف للتداول.\n` +
                `لديك: ${usdtBalance.toFixed(2)} USDT\n` +
                `الحد الأدنى: ${MIN_TRADE_AMOUNT} USDT`);
            return;
        }
        
        // حساب الكمية المناسبة (نستخدم 95% من الرصيد للاحتياط)
        const amountToUse = Math.min(user.tradeAmount || 10, usdtBalance * 0.95);
        
        if (amountToUse < MIN_TRADE_AMOUNT) {
            console.log(`❌ المبلغ المدخل أقل من الحد الأدنى`);
            await bot.sendMessage(user.telegramId, 
                `❌ المبلغ المدخل (${amountToUse.toFixed(2)}) أقل من الحد الأدنى (${MIN_TRADE_AMOUNT})`);
            return;
        }
        
        // جلب فرق السعر
        const ticker = await exchange.fetchTicker(symbol);
        const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
        
        // تعديل الهدف حسب الفرق
        let targetMultiplier = 1.0025; // 0.25%
        let stopMultiplier = 0.9975;
        
        if (spread > 0.2) {
            targetMultiplier = 1.0035;
            stopMultiplier = 0.9965;
        }
        
        const takeProfit = entryPrice * targetMultiplier;
        const stopLoss = entryPrice * stopMultiplier;
        
        console.log(`🟢 فتح صفقة على ${symbol} بمبلغ ${amountToUse.toFixed(2)} USDT`);
        
        // تنفيذ أمر الشراء
        const order = await exchange.createMarketBuyOrder(
            symbol,
            amountToUse / entryPrice
        );
        
        // حفظ الصفقة
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

        // إرسال إشعار
        const message = `
🟢 *صفقة جديدة - ${symbol}*

💰 المبلغ: ${amountToUse.toFixed(2)} USDT
📊 سعر الشراء: $${entryPrice.toFixed(2)}
🎯 الربح: $${takeProfit.toFixed(2)} (0.25%)
🛑 الخسارة: $${stopLoss.toFixed(2)} (0.25%)

⏰ ${new Date().toLocaleString('ar-EG')}
        `;
        
        await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error(`❌ فشل تنفيذ أمر الشراء:`, error.message);
        await bot.sendMessage(user.telegramId, `❌ فشل الشراء: ${error.message}`);
    }
}

// ==================== دالة مراقبة الصفقة المفتوحة (محسنة) ====================
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

        // ربح 0.25%
        if (bidPrice >= trade.takeProfit) {
            shouldExit = true;
            exitReason = '✅ تحقيق الربح';
        }
        // خسارة 0.25%
        else if (currentPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = '❌ وقف خسارة';
        }
        // بعد 45 دقيقة
        else if (minutesPassed >= 45) {
            shouldExit = true;
            exitReason = '⏱️ انتهاء الوقت';
        }

        if (shouldExit) {
            await closeTrade(user, currentPrice, exitReason, exchange);
        }
        
    } catch (error) {
        console.error(`خطأ في مراقبة الصفقة:`, error.message);
    }
}

// ==================== دالة إغلاق الصفقة ====================
async function closeTrade(user, exitPrice, reason, exchange) {
    const trade = user.currentTrade;
    
    try {
        // بيع الكمية كاملة
        const balance = await exchange.fetchBalance();
        const symbolBase = trade.symbol.split('/')[0];
        const cryptoBalance = balance[symbolBase]?.free || 0;
        
        if (cryptoBalance > 0) {
            await exchange.createMarketSellOrder(trade.symbol, cryptoBalance);
        }
        
        // حساب الربح
        const profitPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const profitAmount = (user.tradeAmount || 10) * (profitPercent / 100);
        
        const newTotalProfit = (user.totalProfit || 0) + profitAmount;
        const newTotalTrades = (user.totalTrades || 0) + 1;
        
        await User.findOneAndUpdate(
            { telegramId: user.telegramId },
            {
                $set: {
                    currentTrade: { status: 'closed' },
                    totalProfit: newTotalProfit,
                    totalTrades: newTotalTrades
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
💰 الربح: ${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%
💵 المبلغ: $${Math.abs(profitAmount).toFixed(2)}
📝 ${reason}
        `;
        
        await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error(`❌ فشل البيع:`, error.message);
    }
}

// ==================== دالة البحث عن فرص جديدة (محسنة) ====================
async function findNewTradeOpportunity(user, exchange) {
    const exchangeName = user.selectedExchange;
    const favoriteSymbols = user.favoriteSymbols
        .filter(f => f.exchange === exchangeName)
        .map(f => f.symbol);
    
    if (user.activeSymbol && !favoriteSymbols.includes(user.activeSymbol)) {
        favoriteSymbols.push(user.activeSymbol);
    }

    for (const symbol of favoriteSymbols) {
        try {
            // التحقق من فرق السعر
            const ticker = await exchange.fetchTicker(symbol);
            const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
            
            if (spread > 0.5) continue;
            
            // جلب الشموع
            const ohlcv = await exchange.fetchOHLCV(symbol, '15m', undefined, 30);
            if (ohlcv.length < 20) continue;

            const prices = ohlcv.map(c => c[4]);
            const sma = calculateSMA(prices, 20);
            const currentSMA = sma[sma.length - 1];
            
            const rsi = calculateRSI(prices, 14);
            const currentRSI = rsi[rsi.length - 1];

            const lastThreeCandles = ohlcv.slice(-3);
            
            if (lastThreeCandles.length >= 3) {
                const candle2 = lastThreeCandles[1];
                const candle3 = lastThreeCandles[2];

                const candle2Green = candle2[4] > candle2[1];
                const candle3Green = candle3[4] > candle3[1];
                const aboveSMA = candle3[4] > currentSMA;

                if (candle2Green && candle3Green && aboveSMA && currentRSI < 70) {
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

// ==================== نظام التداول المستمر (كل 30 ثانية) ====================
async function executeTrading() {
    try {
        const users = await User.find({ isRunning: true });
        
        for (const user of users) {
            try {
                const activeExchange = user.selectedExchange;
                const exchangeKeys = user.exchanges[activeExchange];
                
                if (!exchangeKeys?.isActive) continue;

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

// تشغيل التداول كل 30 ثانية (أسرع)
setInterval(executeTrading, 30 * 1000);

// ==================== API المسارات مع تحسين الأداء ====================

// الصفحة الرئيسية مع كاش
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), {
        maxAge: '1h', // كاش لمدة ساعة
        etag: true
    });
});

// مسار الصحة
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        time: new Date().toISOString(),
        uptime: process.uptime(),
        version: '5.0.0'
    });
});

// API جلب بيانات السوق مع كاش
app.get("/api/market-scan/:id", async (req, res) => {
    const userId = req.params.id;
    const cacheKey = `market_${userId}`;
    
    // التحقق من الكاش
    if (cache.marketData.has(cacheKey)) {
        const cached = cache.marketData.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
            return res.json(cached.data);
        }
    }
    
    try {
        const user = await User.findOne({ telegramId: userId });
        
        if (!user) {
            return res.json({ results: [], balance: 0, isRunning: false });
        }

        const exchange = new ccxt.bingx();
        let results = [];

        const symbolsToScan = user.favoriteSymbols?.length > 0 
            ? user.favoriteSymbols.map(f => f.symbol)
            : (user.activeSymbol ? [user.activeSymbol] : []);

        for (let sym of symbolsToScan) {
            try {
                const ohlcv = await exchange.fetchOHLCV(sym, '15m', undefined, 30);
                const prices = ohlcv.map(x => x[4]);
                const current = prices[prices.length - 1];
                
                const sma = calculateSMA(prices, 20);
                const currentSMA = sma[sma.length - 1] || 0;
                const rsi = calculateRSI(prices, 14);
                const currentRSI = rsi[rsi.length - 1] || 50;
                
                results.push({
                    symbol: sym,
                    price: current.toFixed(2),
                    sma: currentSMA.toFixed(2),
                    rsi: currentRSI.toFixed(2),
                    isActive: user.isRunning && user.activeSymbol === sym
                });
            } catch (e) {
                console.log(`خطأ في جلب ${sym}:`, e.message);
            }
        }
        
        const responseData = { 
            results, 
            balance: user.totalProfit || 0,
            isRunning: user.isRunning || false,
            activeSymbol: user.activeSymbol
        };
        
        // حفظ في الكاش
        cache.marketData.set(cacheKey, {
            data: responseData,
            timestamp: Date.now()
        });
        
        res.json(responseData);
        
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// API جلب الرصيد مع كاش
app.get("/api/real-balance/:id", async (req, res) => {
    const userId = req.params.id;
    const cacheKey = `balance_${userId}`;
    
    // التحقق من الكاش
    if (cache.balanceData.has(cacheKey)) {
        const cached = cache.balanceData.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
            return res.json(cached.data);
        }
    }
    
    try {
        const user = await User.findOne({ telegramId: userId });
        
        if (!user) {
            return res.json({ success: false, balance: 0 });
        }
        
        try {
            const exchange = await getExchangeConnection(user);
            const balance = await exchange.fetchBalance();
            const usdtBalance = balance.USDT?.free || 0;
            
            const responseData = { 
                success: true, 
                balance: usdtBalance,
                exchange: user.selectedExchange
            };
            
            // حفظ في الكاش
            cache.balanceData.set(cacheKey, {
                data: responseData,
                timestamp: Date.now()
            });
            
            res.json(responseData);
            
        } catch (exchangeError) {
            res.json({ success: false, balance: 0 });
        }
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// باقي APIs (نفس الكود مع تحسينات)...

// ==================== نظام إبقاء السيرفر نشطاً ====================
function startKeepAlive() {
    const https = require('https');
    const url = config.WEBAPP_URL;
    
    setInterval(() => {
        https.get(url, (res) => {
            console.log(`✅ Ping - ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {});
        
        setTimeout(() => {
            https.get(`${url}/health`, () => {}).on('error', () => {});
        }, 1000);
        
    }, 5 * 60 * 1000);
}

// ==================== تشغيل الخادم ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 البوت: https://t.me/${config.BOT_USERNAME}`);
    console.log(`💰 الحد الأدنى: 1.20 USDT`);
    console.log(`⚡ سرعة التداول: كل 30 ثانية`);
    
    startKeepAlive();
});

process.on('SIGINT', () => {
    console.log('🛑 جاري إغلاق البوت...');
    bot.stopPolling();
    mongoose.connection.close();
    process.exit();
});