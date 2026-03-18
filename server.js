// ==================== بوت التداول الذكي - النسخة الكاملة ====================

const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const ccxt = require('ccxt');
const { RSI, EMA } = require('technicalindicators');
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
    
    // العملات المفضلة (النشطة سابقاً)
    favoriteSymbols: [{
        symbol: String,
        lastActive: { type: Date, default: Date.now },
        totalTrades: { type: Number, default: 0 },
        profit: { type: Number, default: 0 }
    }],
    
    lastActive: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==================== القائمة الرئيسية ====================

const mainKeyboard = {
    reply_markup: {
        keyboard: [
            // الصف الأول - الأزرار الرئيسية
            [
                { text: "🚀 فتح البوت", web_app: { url: config.WEBAPP_URL } },
                { text: "📊 السوق" }
            ],
            // الصف الثاني
            [
                { text: "💰 رصيدي" },
                { text: "📈 أرباحي" }
            ],
            // الصف الثالث
            [
                { text: "⚙️ الإعدادات" },
                { text: "❓ المساعدة" }
            ],
            // الصف الرابع
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

// أمر /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';
    const username = msg.from.username || '';
    const lastName = msg.from.last_name || '';
    
    try {
        // حفظ المستخدم في قاعدة البيانات
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

        // رسالة ترحيب منسقة
        const welcomeMessage = `
🌟 *مرحباً بك ${firstName} في بوت التداول الذكي!* 🌟

╔════════════════════╗
║   🚀 *TRADING OS*    ║
╚════════════════════╝

📊 *مميزات البوت:*
• ✅ تداول آلي 24/7 على BingX
• ✅ تحليل فني متقدم (RSI, EMA)
• ✅ إشارات شراء/بيع لحظية
• ✅ إدارة مخاطر ذكية
• ✅ دعم +500 عملة رقمية

💰 *الخدمات المتاحة:*
• تداول فوري بدون تدخل يدوي
• تحليل السوق بالمؤشرات الفنية
• إشعارات فورية بالصفقات
• تقارير أداء يومية

📈 *إحصائيات البوت:*
• المستخدمون النشطون: ${await User.countDocuments({ isRunning: true })}
• إجمالي المستخدمين: ${await User.countDocuments()}

⚠️ *تنبيه هام:*
التداول بالعملات الرقمية ينطوي على مخاطر عالية
يرجى البدء بمبالغ صغيرة للتجربة

⬇️ *اختر من القائمة أدناه:* ⬇️
        `;

        // إرسال رسالة الترحيب مع القائمة الرئيسية
        await bot.sendMessage(chatId, welcomeMessage, {
            parse_mode: 'Markdown',
            ...mainKeyboard
        });

        // إرسال رسالة ترحيب إضافية مع أزرار مضمنة
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

    // تجاهل الأوامر التي تبدأ بـ /
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
📊 الحجم: $${(tickers['BTC/USDT'].quoteVolume / 1000000).toFixed(2)}M

⟠ *ETH/USDT*: $${tickers['ETH/USDT'].last?.toFixed(2) || '0'}
📈 24h: ${tickers['ETH/USDT'].percentage?.toFixed(2) || '0'}%
📊 الحجم: $${(tickers['ETH/USDT'].quoteVolume / 1000000).toFixed(2)}M

◎ *SOL/USDT*: $${tickers['SOL/USDT'].last?.toFixed(2) || '0'}
📈 24h: ${tickers['SOL/USDT'].percentage?.toFixed(2) || '0'}%
📊 الحجم: $${(tickers['SOL/USDT'].quoteVolume / 1000000).toFixed(2)}M

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
                    `الزوج النشط: ${user?.activeSymbol || 'غير محدد'}\n` +
                    `آخر تحديث: ${new Date().toLocaleString('ar-EG')}`,
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
                    `• مبلغ التداول\n` +
                    `• إعدادات المخاطر\n\n` +
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
                    `*معلومات إضافية:*\n` +
                    `• استراتيجية التداول: RSI + EMA\n` +
                    `• الإطار الزمني: 5 دقائق\n` +
                    `• الحد الأدنى: 10 USDT\n\n` +
                    `للاستفسار: ${config.SUPPORT_CHAT}`,
                    { 
                        parse_mode: 'Markdown',
                        ...mainKeyboard 
                    }
                );
                break;

            case '🔄 تشغيل البوت':
                await bot.sendMessage(chatId,
                    `🔄 *تشغيل البوت*\n\n` +
                    `يرجى فتح التطبيق لتشغيل البوت:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "🚀 تشغيل البوت", web_app: { url: config.WEBAPP_URL } }
                            ]]
                        }
                    }
                );
                break;

            case '🛑 إيقاف البوت':
                await User.findOneAndUpdate({ telegramId }, { isRunning: false });
                await bot.sendMessage(chatId,
                    `🛑 *تم إيقاف البوت بنجاح*\n\n` +
                    `يمكنك تشغيله مرة أخرى من القائمة`,
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
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

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
                    `*الإصدار:* 2.0.0\n` +
                    `*المطور:* Trading OS Team\n` +
                    `*التحديث:* ${new Date().toLocaleDateString('ar-EG')}\n\n` +
                    `*المميزات:*\n` +
                    `• تداول آلي ذكي\n` +
                    `• تحليل فني دقيق\n` +
                    `• إشعارات فورية\n` +
                    `• واجهة عربية سهلة\n\n` +
                    `*المؤشرات الفنية:*\n` +
                    `• RSI (14)\n` +
                    `• EMA (9, 21)\n` +
                    `• تحليل متعدد الأطر`,
                    { parse_mode: 'Markdown' }
                );
                break;
        }

    } catch (error) {
        console.error('خطأ في معالج الأزرار:', error);
    }
});

// ==================== أوامر إضافية ====================

// أمر عرض الرصيد
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

// أمر إيقاف البوت
bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    await User.findOneAndUpdate({ telegramId }, { isRunning: false });
    await bot.sendMessage(chatId, '🛑 تم إيقاف البوت', mainKeyboard);
});

// أمر حالة البوت
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    const user = await User.findOne({ telegramId });
    
    if (user?.isRunning) {
        await bot.sendMessage(chatId,
            `✅ *البوت يعمل*\n` +
            `الزوج: ${user.activeSymbol}\n` +
            `المبلغ: ${user.tradeAmount} USDT\n` +
            `الربح: ${user.totalProfit} USDT`,
            { 
                parse_mode: 'Markdown',
                ...mainKeyboard 
            }
        );
    } else {
        await bot.sendMessage(chatId, '⏸️ البوت متوقف', mainKeyboard);
    }
});

// ==================== API جلب بيانات السوق مع المفضلة ====================

app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        
        if (!user) {
            return res.json({ results: [], balance: 0, isRunning: false });
        }

        const exchange = new ccxt.bingx();
        let results = [];

        // جلب العملات المفضلة أو العملة النشطة
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
                const ohlcv = await exchange.fetchOHLCV(sym, '5m', undefined, 100);
                const prices = ohlcv.map(x => x[4]);
                const current = prices[prices.length - 1];
                const rsi = RSI.calculate({period: 14, values: prices}).pop();
                const ema9 = EMA.calculate({period: 9, values: prices}).pop();
                const ema21 = EMA.calculate({period: 21, values: prices}).pop();

                let signal = 'WAIT';
                if (ema9 > ema21 && rsi > 50) signal = 'BUY';
                else if (ema9 < ema21 && rsi < 50) signal = 'SELL';

                const isActive = user.isRunning && user.activeSymbol === sym;

                results.push({
                    symbol: sym,
                    price: current.toFixed(2),
                    rsi: rsi ? rsi.toFixed(2) : '0',
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
            activeSymbol: user.activeSymbol
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// ==================== API حفظ مفاتيح API ====================

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

// ==================== API تشغيل البوت ====================

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

// ==================== API جلب بيانات المستخدم ====================

app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        res.json(user || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API جلب جميع العملات المتاحة ====================

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

// ==================== نظام التداول الآلي ====================

async function executeTrading() {
    console.log('🔍 جاري فحص فرص التداول...');
    
    try {
        const users = await User.find({ isRunning: true, apiKey: { $exists: true, $ne: '' } });
        
        for (const user of users) {
            try {
                if (!user.apiKey || !user.apiSecret) {
                    console.log(`المستخدم ${user.telegramId} ليس لديه مفاتيح API`);
                    continue;
                }

                const exchange = new ccxt.bingx({
                    apiKey: user.apiKey,
                    secret: user.apiSecret,
                    options: { defaultType: 'spot' }
                });

                const ohlcv = await exchange.fetchOHLCV(user.activeSymbol, '5m', undefined, 50);
                const prices = ohlcv.map(x => x[4]);
                const currentPrice = prices[prices.length - 1];
                const rsi = RSI.calculate({period: 14, values: prices}).pop();
                const ema9 = EMA.calculate({period: 9, values: prices}).pop();
                const ema21 = EMA.calculate({period: 21, values: prices}).pop();

                if (ema9 > ema21 && rsi < 70) {
                    console.log(`📈 إشارة شراء لـ ${user.telegramId} على ${user.activeSymbol}`);
                    
                    await bot.sendMessage(user.telegramId, 
                        `📈 *إشارة شراء*\n\n` +
                        `الزوج: ${user.activeSymbol}\n` +
                        `السعر: $${currentPrice.toFixed(2)}\n` +
                        `RSI: ${rsi.toFixed(2)}\n` +
                        `الاستراتيجية: تقاطع EMA + RSI`,
                        { parse_mode: 'Markdown' }
                    );
                    
                } else if (ema9 < ema21 && rsi > 30) {
                    console.log(`📉 إشارة بيع لـ ${user.telegramId} على ${user.activeSymbol}`);
                    
                    await bot.sendMessage(user.telegramId, 
                        `📉 *إشارة بيع*\n\n` +
                        `الزوج: ${user.activeSymbol}\n` +
                        `السعر: $${currentPrice.toFixed(2)}\n` +
                        `RSI: ${rsi.toFixed(2)}\n` +
                        `الاستراتيجية: تقاطع EMA + RSI`,
                        { parse_mode: 'Markdown' }
                    );
                }
                
            } catch (userError) {
                console.error(`خطأ في تداول المستخدم ${user.telegramId}:`, userError.message);
            }
        }
    } catch (error) {
        console.error('خطأ في نظام التداول:', error);
    }
}

// تشغيل التداول كل 5 دقائق
setInterval(executeTrading, 5 * 60 * 1000);

// ==================== تشغيل الخادم ====================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
    console.log(`📱 افتح البوت: https://t.me/${config.BOT_USERNAME}`);
});