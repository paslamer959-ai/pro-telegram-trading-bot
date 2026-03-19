// ==================== بوت التداول الذكي - النسخة الكاملة مع دعم المنصات المتعددة ====================

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
• ✅ دعم 4 منصات: BingX, Binance, Bybit, MEXC
• ✅ استراتيجية MA مع شمعتين خضر
• ✅ ربح/خسارة 0.25% لكل صفقة
• ✅ إدارة مخاطر ذكية

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
                const exchangeName = user?.selectedExchange || 'bingx';
                
                let balanceText = `💰 *رصيدك الحالي:*\n\n`;
                balanceText += `المنصة النشطة: *${exchangeName.toUpperCase()}*\n`;
                balanceText += `الربح/الخسارة: *${user?.totalProfit || 0} USDT*\n`;
                balanceText += `عدد الصفقات: *${user?.totalTrades || 0}*\n`;
                balanceText += `نسبة النجاح: *${user?.winRate || 0}%*\n`;
                balanceText += `حالة البوت: ${user?.isRunning ? '✅ يعمل' : '⏸️ متوقف'}\n`;
                balanceText += `الزوج النشط: ${user?.activeSymbol || 'غير محدد'}`;
                
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
                    `• مفاتيح API للمنصات (BingX, Binance, Bybit, MEXC)\n` +
                    `• اختيار المنصة النشطة\n` +
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
                    `1️⃣ أضف مفاتيح API من المنصة التي تختارها\n` +
                    `2️⃣ اختر المنصة النشطة\n` +
                    `3️⃣ اختر العملة والمبلغ\n` +
                    `4️⃣ شغّل البوت\n\n` +
                    `*الاستراتيجية:*\n` +
                    `• الدخول: شمعتين خضر فوق MA + RSI < 70\n` +
                    `• الخروج: 0.25% ربح/خسارة أو 3 شموع\n\n` +
                    `*المنصات المدعومة:* BingX, Binance, Bybit, MEXC\n\n` +
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
                    `*الإصدار:* 4.0.0\n` +
                    `*الاستراتيجية:* MA + شمعتين خضر + RSI\n` +
                    `*الهدف:* 0.25% ربح/خسارة\n\n` +
                    `*المنصات المدعومة:*\n` +
                    `• BingX\n` +
                    `• Binance\n` +
                    `• Bybit\n` +
                    `• MEXC\n\n` +
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
            `🟢 صفقة مفتوحة على ${user.currentTrade.symbol} (${user.currentTrade.exchange})` : 
            '⚪ لا توجد صفقة مفتوحة';
            
        await bot.sendMessage(chatId,
            `✅ *البوت يعمل*\n` +
            `المنصة النشطة: ${user.selectedExchange.toUpperCase()}\n` +
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
                options: { defaultType: 'spot' }
            });
            break;
            
        case 'binance':
            exchange = new ccxt.binance({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                options: { defaultType: 'spot' }
            });
            break;
            
        case 'bybit':
            exchange = new ccxt.bybit({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                options: { defaultType: 'spot' }
            });
            break;
            
        case 'mexc':
            exchange = new ccxt.mexc({
                apiKey: exchangeConfig.apiKey,
                secret: exchangeConfig.apiSecret,
                options: { defaultType: 'spot' }
            });
            break;
            
        default:
            throw new Error('❌ منصة غير مدعومة');
    }
    
    await exchange.loadMarkets();
    console.log(`✅ متصل بـ ${exchangeName} للمستخدم ${user.telegramId}`);
    
    return exchange;
}

// ==================== دالة فتح صفقة جديدة ====================
async function openNewTrade(user, symbol, entryPrice, sma, exchange) {
    const exchangeName = user.selectedExchange;
    
    // جلب فرق السعر
    const ticker = await exchange.fetchTicker(symbol);
    const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
    
    // تعديل الهدف حسب الفرق
    let targetMultiplier = 1.0025; // 0.25%
    let stopMultiplier = 0.9975;   // -0.25%
    
    if (spread > 0.2) {
        targetMultiplier = 1.0035; // 0.35%
        stopMultiplier = 0.9965;   // -0.35%
        console.log(`⚠️ فرق كبير (${spread.toFixed(3)}%) - تعديل الأهداف`);
    }
    
    const takeProfit = entryPrice * targetMultiplier;
    const stopLoss = entryPrice * stopMultiplier;
    
    console.log(`🟢 فتح صفقة جديدة لـ ${user.telegramId} على ${symbol} (${exchangeName})`);
    console.log(`   السعر: ${entryPrice}, TP: ${takeProfit}, SL: ${stopLoss}`);
    
    let orderId = null;
    
    // تنفيذ أمر الشراء الحقيقي
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
        } else {
            console.log(`❌ رصيد غير كاف: ${usdtBalance} USDT`);
            await bot.sendMessage(user.telegramId, `❌ رصيد غير كاف للتداول. لديك ${usdtBalance} USDT`);
            return;
        }
    } catch (orderError) {
        console.error(`❌ فشل تنفيذ أمر الشراء:`, orderError.message);
        await bot.sendMessage(user.telegramId, `❌ فشل تنفيذ أمر الشراء: ${orderError.message}`);
        return;
    }
    
    // حفظ الصفقة في قاعدة البيانات
    await User.findOneAndUpdate(
        { telegramId: user.telegramId },
        {
            $set: {
                currentTrade: {
                    symbol: symbol,
                    exchange: exchangeName,
                    entryPrice: entryPrice,
                    takeProfit: takeProfit,
                    stopLoss: stopLoss,
                    entryTime: new Date(),
                    orderId: orderId,
                    status: 'open'
                },
                lastTradeTime: new Date()
            }
        }
    );

    // إرسال إشعار
    const message = `
🟢 *صفقة جديدة - ${symbol} (${exchangeName.toUpperCase()})*

📊 *تفاصيل الدخول:*
• سعر الشراء: $${entryPrice.toFixed(6)}
• المتوسط المتحرك: $${sma.toFixed(6)}
• RSI: أقل من 70 ✅
• شمعتين خضر فوق MA ✅
• فرق السعر: ${spread.toFixed(3)}%

🎯 *الأهداف:*
• ✅ ربح: $${takeProfit.toFixed(6)} (${((targetMultiplier-1)*100).toFixed(2)}%)
• ❌ خسارة: $${stopLoss.toFixed(6)} (${((1-stopMultiplier)*100).toFixed(2)}%)
• ⏱️ حد أقصى: 3 شموع

⏰ الوقت: ${new Date().toLocaleString('ar-EG')}
    `;
    
    await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
}

// ==================== دالة مراقبة الصفقة المفتوحة ====================
async function handleOpenTrade(user, exchange) {
    const trade = user.currentTrade;
    
    try {
        const ticker = await exchange.fetchTicker(trade.symbol);
        const currentPrice = ticker.last;
        const bidPrice = ticker.bid; // سعر البيع
        const askPrice = ticker.ask; // سعر الشراء
        
        const entryTime = new Date(trade.entryTime).getTime();
        const currentTime = new Date().getTime();
        const candlesPassed = Math.floor((currentTime - entryTime) / (15 * 60 * 1000));
        
        let exitReason = '';
        let exitPrice = bidPrice; // نبيع على سعر البيد
        let shouldExit = false;

        // التحقق من تحقيق الربح
        if (bidPrice >= trade.takeProfit) {
            shouldExit = true;
            exitReason = '✅ تحقيق هدف الربح';
            exitPrice = trade.takeProfit;
            console.log(`💰 ربح! السعر: ${bidPrice} >= ${trade.takeProfit}`);
        }
        // التحقق من وقف الخسارة
        else if (askPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = '❌ وقف خسارة';
            exitPrice = trade.stopLoss;
            console.log(`📉 خسارة! السعر: ${askPrice} <= ${trade.stopLoss}`);
        }
        // الخروج بعد 3 شموع
        else if (candlesPassed >= 3) {
            shouldExit = true;
            exitReason = '⏱️ إغلاق الشمعة الثالثة';
            exitPrice = bidPrice;
            console.log(`⏱️ خروج بعد 3 شموع - السعر: ${bidPrice}`);
        }

        if (shouldExit) {
            await closeTrade(user, exitPrice, exitReason, exchange);
        } else {
            console.log(`👀 مراقبة ${trade.symbol} - السعر: ${currentPrice} | TP: ${trade.takeProfit} | SL: ${trade.stopLoss}`);
        }
        
    } catch (error) {
        console.error(`خطأ في مراقبة صفقة ${user.telegramId}:`, error.message);
    }
}

// ==================== دالة إغلاق الصفقة ====================
async function closeTrade(user, exitPrice, reason, exchange) {
    const trade = user.currentTrade;
    
    // تنفيذ أمر البيع الحقيقي
    try {
        const balance = await exchange.fetchBalance();
        const symbolBase = trade.symbol.split('/')[0];
        const cryptoBalance = balance[symbolBase]?.free || 0;
        
        if (cryptoBalance > 0) {
            const sellOrder = await exchange.createMarketSellOrder(
                trade.symbol,
                cryptoBalance
            );
            console.log(`✅ أمر بيع منفذ بنجاح!`, sellOrder.id);
            
            if (sellOrder.price) {
                exitPrice = sellOrder.price;
            }
        }
    } catch (orderError) {
        console.error(`❌ فشل تنفيذ أمر البيع:`, orderError.message);
        await bot.sendMessage(user.telegramId, `❌ فشل تنفيذ أمر البيع: ${orderError.message}`);
    }
    
    // حساب الربح/الخسارة
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
                    exchange: trade.exchange,
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
${emoji} *صفقة مغلقة - ${trade.symbol} (${trade.exchange.toUpperCase()})*

📊 *النتيجة:*
• سعر الدخول: $${trade.entryPrice.toFixed(6)}
• سعر الخروج: $${exitPrice.toFixed(6)}
• الربح/الخسارة: ${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%
• المبلغ: $${Math.abs(profitAmount).toFixed(2)} USDT

📝 السبب: ${reason}
💰 إجمالي الأرباح: $${newTotalProfit.toFixed(2)} USDT
📊 نسبة النجاح: ${newWinRate.toFixed(1)}%

⏰ الوقت: ${new Date().toLocaleString('ar-EG')}
    `;
    
    await bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
}

// ==================== دالة البحث عن فرص جديدة ====================
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
            
            if (spread > 0.5) {
                console.log(`⏸️ تجاهل ${symbol} على ${exchangeName} - فرق سعر كبير: ${spread.toFixed(2)}%`);
                continue;
            }
            
            // جلب الشموع
            const ohlcv = await exchange.fetchOHLCV(symbol, '15m', undefined, 50);
            
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
                    
                    console.log(`✅ فرصة على ${symbol} (${exchangeName}) - RSI: ${currentRSI.toFixed(2)}`);
                    
                    await openNewTrade(user, symbol, candle3[4], currentSMA, exchange);
                    return true;
                }
            }
        } catch (symbolError) {
            console.log(`خطأ في فحص ${symbol} على ${exchangeName}:`, symbolError.message);
        }
    }
    return false;
}

// ==================== نظام التداول الآلي ====================
async function executeTrading() {
    console.log('🔍 جاري فحص فرص التداول...');
    
    try {
        const users = await User.find({ isRunning: true });
        
        for (const user of users) {
            try {
                const activeExchange = user.selectedExchange;
                const exchangeKeys = user.exchanges[activeExchange];
                
                if (!exchangeKeys?.isActive) {
                    console.log(`المستخدم ${user.telegramId} ليس لديه مفاتيح لـ ${activeExchange}`);
                    continue;
                }

                const exchange = await getExchangeConnection(user);

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

// ==================== API المسارات ====================

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// مسار الصحة
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'alive', 
        time: new Date().toISOString(),
        uptime: process.uptime(),
        version: '4.0.0',
        exchanges: ['bingx', 'binance', 'bybit', 'mexc']
    });
});

// API جلب بيانات السوق مع المفضلة
app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ results: [], balance: 0, isRunning: false });
        }

        const exchange = new ccxt.bingx(); // استخدام BingX للبيانات العامة
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
                
                const sma = calculateSMA(prices, 20);
                const currentSMA = sma[sma.length - 1] || 0;
                
                const rsi = calculateRSI(prices, 14);
                const currentRSI = rsi[rsi.length - 1] || 50;
                
                const lastTwoCandles = ohlcv.slice(-2);
                const candle1Green = lastTwoCandles[0] && lastTwoCandles[0][4] > lastTwoCandles[0][1];
                const candle2Green = lastTwoCandles[1] && lastTwoCandles[1][4] > lastTwoCandles[1][1];
                
                let signal = 'WAIT';
                if (candle1Green && candle2Green && current > currentSMA && currentRSI < 70) signal = 'BUY';

                const isActive = user.isRunning && user.activeSymbol === sym;

                results.push({
                    symbol: sym,
                    price: current.toFixed(6),
                    sma: currentSMA.toFixed(6),
                    rsi: currentRSI.toFixed(2),
                    signal: signal,
                    change: ((current - prices[0]) / prices[0] * 100).toFixed(2),
                    isActive: isActive,
                    exchange: user.favoriteSymbols?.find(f => f.symbol === sym)?.exchange || 'bingx',
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
            selectedExchange: user.selectedExchange,
            currentTrade: user.currentTrade
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// API حفظ مفاتيح المنصات المتعددة
app.post("/api/save-exchange-keys", async (req, res) => {
    try {
        const { telegramId, exchange, apiKey, apiSecret } = req.body;
        
        if (!telegramId || !exchange || !apiKey || !apiSecret) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // التحقق من صحة المفاتيح
        try {
            let testExchange;
            switch(exchange) {
                case 'bingx':
                    testExchange = new ccxt.bingx({ apiKey, secret: apiSecret });
                    break;
                case 'binance':
                    testExchange = new ccxt.binance({ apiKey, secret: apiSecret });
                    break;
                case 'bybit':
                    testExchange = new ccxt.bybit({ apiKey, secret: apiSecret });
                    break;
                case 'mexc':
                    testExchange = new ccxt.mexc({ apiKey, secret: apiSecret });
                    break;
                default:
                    return res.status(400).json({ error: 'منصة غير مدعومة' });
            }
            
            await testExchange.fetchBalance();
            
        } catch (testError) {
            return res.status(400).json({ 
                error: '❌ مفاتيح غير صالحة',
                details: testError.message 
            });
        }
        
        const updateQuery = {
            [`exchanges.${exchange}.apiKey`]: apiKey,
            [`exchanges.${exchange}.apiSecret`]: apiSecret,
            [`exchanges.${exchange}.isActive`]: true
        };
        
        await User.findOneAndUpdate(
            { telegramId },
            { $set: updateQuery },
            { upsert: true }
        );
        
        res.json({ 
            success: true, 
            message: `✅ تم حفظ مفاتيح ${exchange} بنجاح` 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API تغيير المنصة النشطة
app.post("/api/set-active-exchange", async (req, res) => {
    try {
        const { telegramId, exchange } = req.body;
        
        if (!telegramId || !exchange) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ telegramId });
        
        if (!user || !user.exchanges[exchange]?.isActive) {
            return res.status(400).json({ 
                error: '❌ هذه المنصة غير مفعلة. أضف مفاتيحها أولاً.' 
            });
        }
        
        await User.findOneAndUpdate(
            { telegramId },
            { $set: { selectedExchange: exchange } }
        );
        
        res.json({ 
            success: true, 
            message: `✅ تم التبديل إلى ${exchange}` 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API جلب الرصيد الحقيقي من المنصة النشطة
app.get("/api/real-balance/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ success: false, balance: 0 });
        }
        
        try {
            const exchange = await getExchangeConnection(user);
            const balance = await exchange.fetchBalance();
            
            const usdtBalance = balance.USDT?.free || 0;
            
            res.json({ 
                success: true, 
                balance: usdtBalance,
                exchange: user.selectedExchange,
                total: balance.total
            });
            
        } catch (exchangeError) {
            console.error('خطأ في جلب الرصيد:', exchangeError.message);
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

// API إضافة إلى المفضلة
app.post("/api/add-to-favorites", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        if (!telegramId || !symbol) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        
        const exists = user.favoriteSymbols?.some(f => f.symbol === symbol && f.exchange === user.selectedExchange);
        
        if (!exists) {
            await User.findOneAndUpdate(
                { telegramId },
                { 
                    $push: { 
                        favoriteSymbols: { 
                            symbol: symbol, 
                            exchange: user.selectedExchange,
                            lastActive: new Date(),
                            totalTrades: 0,
                            profit: 0
                        } 
                    },
                    $set: { tradeAmount: amount }
                }
            );
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API تشغيل البوت
app.post("/api/start-bot", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        if (!telegramId || !symbol || !amount) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ telegramId });
        
        if (user) {
            const exists = user.favoriteSymbols?.some(f => f.symbol === symbol && f.exchange === user.selectedExchange);
            
            if (!exists) {
                await User.findOneAndUpdate(
                    { telegramId },
                    { 
                        $push: { 
                            favoriteSymbols: { 
                                symbol: symbol, 
                                exchange: user.selectedExchange,
                                lastActive: new Date(),
                                totalTrades: 0,
                                profit: 0
                            } 
                        }
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

// API جلب بيانات المستخدم
app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        res.json(user || {});
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

// ==================== نظام إبقاء السيرفر نشطاً ====================
function startKeepAlive() {
    const https = require('https');
    const url = config.WEBAPP_URL || `https://trading-os-bot.onrender.com`;
    
    console.log('🔄 بدء نظام إبقاء السيرفر نشطاً...');
    
    setInterval(() => {
        const startTime = Date.now();
        
        https.get(url, (res) => {
            const duration = Date.now() - startTime;
            console.log(`✅ Ping ناجح - ${res.statusCode} - ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {
            console.log(`❌ Ping فشل - ${err.message}`);
        });
        
        setTimeout(() => {
            https.get(`${url}/health`, () => {}).on('error', () => {});
        }, 1000);
        
    }, 5 * 60 * 1000);
}

// ==================== تشغيل الخادم ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 افتح البوت: https://t.me/${config.BOT_USERNAME}`);
    console.log(`🏦 المنصات المدعومة: BingX, Binance, Bybit, MEXC`);
    console.log(`⏱️ استراتيجية MA + RSI - ربح/خسارة 0.25%`);
    
    startKeepAlive();
});

process.on('SIGINT', () => {
    console.log('🛑 جاري إغلاق البوت...');
    bot.stopPolling();
    mongoose.connection.close();
    process.exit();
});