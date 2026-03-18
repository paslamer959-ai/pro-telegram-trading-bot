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

// تأكد من وجود توكن البوت
if (!config.BOT_TOKEN) {
    console.error('❌ خطأ: توكن البوت غير موجود في ملف config.js');
    process.exit(1);
}

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
console.log('✅ البوت يعمل...');

// الاتصال بقاعدة البيانات
mongoose.connect(config.MONGO_URL)
    .then(() => console.log('✅ متصل بقاعدة البيانات'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    apiKey: String,
    apiSecret: String,
    activeSymbol: { type: String, default: 'BTC/USDT' },
    tradeAmount: { type: Number, default: 0 },
    isRunning: { type: Boolean, default: false },
    totalProfit: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ==================== أوامر البوت في تيليجرام ====================

// أمر /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'مستخدم';
    
    try {
        // حفظ المستخدم في قاعدة البيانات
        await User.findOneAndUpdate(
            { telegramId },
            { telegramId },
            { upsert: true }
        );

        await bot.sendMessage(chatId, 
            `مرحباً بك ${firstName} في بوت التداول الذكي! 🚀\n\n` +
            `يمكنك التحكم في البوت من خلال الأزرار التالية:`,
            {
                reply_markup: {
                    keyboard: [
                        [{ text: "📊 عرض السوق", web_app: { url: config.WEBAPP_URL } }],
                        [{ text: "💰 رصيدي" }, { text: "⚙️ الإعدادات", web_app: { url: config.WEBAPP_URL } }],
                        [{ text: "🔄 تشغيل البوت", web_app: { url: config.WEBAPP_URL } }, { text: "🛑 إيقاف البوت" }]
                    ],
                    resize_keyboard: true
                }
            }
        );
    } catch (error) {
        console.error('خطأ في أمر /start:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ، حاول مرة أخرى');
    }
});

// أمر /balance (عرض الرصيد)
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        const user = await User.findOne({ telegramId });
        
        if (user) {
            await bot.sendMessage(chatId, 
                `💰 *رصيدك الحالي:*\n` +
                `الربح/الخسارة: *${user.totalProfit || 0} USDT*\n` +
                `الحالة: ${user.isRunning ? '✅ يعمل' : '⏸️ متوقف'}\n` +
                `الزوج: ${user.activeSymbol || 'غير محدد'}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, "⚠️ لم تقم بتسجيل الدخول بعد. أرسل /start");
        }
    } catch (error) {
        console.error('خطأ في أمر /balance:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ');
    }
});

// أمر إيقاف البوت
bot.onText(/🛑 إيقاف البوت|\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        await User.findOneAndUpdate({ telegramId }, { isRunning: false });
        await bot.sendMessage(chatId, "🛑 تم إيقاف البوت بنجاح");
    } catch (error) {
        console.error('خطأ في إيقاف البوت:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ');
    }
});

// أمر حالة البوت
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        const user = await User.findOne({ telegramId });
        
        if (user && user.isRunning) {
            await bot.sendMessage(chatId, 
                `✅ *البوت يعمل حالياً*\n\n` +
                `الزوج: *${user.activeSymbol}*\n` +
                `المبلغ: *${user.tradeAmount} USDT*\n` +
                `الربح الحالي: *${user.totalProfit} USDT*`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, "⏸️ البوت متوقف. قم بتشغيله من خلال الضغط على '🔄 تشغيل البوت'");
        }
    } catch (error) {
        console.error('خطأ في أمر /status:', error);
        await bot.sendMessage(chatId, '❌ حدث خطأ');
    }
});

// التعامل مع الرسائل النصية العادية
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // تجاهل الأوامر التي تم التعامل معها بالفعل
    if (text.startsWith('/') || text.includes('web_app')) return;
    
    if (text === '💰 رصيدي') {
        await bot.sendMessage(chatId, '💰 الرجاء استخدام الأمر /balance');
    }
});

// ==================== API endpoints للويب أب ====================

// جلب بيانات السوق
app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        const exchange = new ccxt.bingx();
        
        // قائمة العملات المدعومة
        const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AR/USDT', 'BNB/USDT'];
        let results = [];

        for (let sym of symbols) {
            try {
                const ohlcv = await exchange.fetchOHLCV(sym, '5m', undefined, 100);
                const prices = ohlcv.map(x => x[4]);
                const current = prices[prices.length - 1];
                const rsi = RSI.calculate({period: 14, values: prices}).pop();
                const ema9 = EMA.calculate({period: 9, values: prices}).pop();
                const ema21 = EMA.calculate({period: 21, values: prices}).pop();

                // تحديد الإشارة
                let signal = 'WAIT';
                if (ema9 > ema21 && rsi > 50) signal = 'BUY';
                else if (ema9 < ema21 && rsi < 50) signal = 'SELL';

                results.push({
                    symbol: sym,
                    price: current.toFixed(2),
                    rsi: rsi ? rsi.toFixed(2) : '0',
                    signal: signal,
                    change: ((current - prices[0]) / prices[0] * 100).toFixed(2)
                });
            } catch (e) {
                console.log(`خطأ في جلب بيانات ${sym}:`, e.message);
            }
        }
        
        res.json({ 
            results, 
            balance: user ? user.totalProfit : 0,
            isRunning: user ? user.isRunning : false
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

// حفظ مفاتيح API
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

// تشغيل البوت
app.post("/api/start-bot", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        
        if (!telegramId || !symbol || !amount) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        await User.findOneAndUpdate(
            { telegramId }, 
            { activeSymbol: symbol, tradeAmount: amount, isRunning: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// جلب بيانات المستخدم
app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        res.json(user || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== نظام التداول الآلي ====================
async function executeTrading() {
    console.log('🔍 جاري فحص فرص التداول...');
    
    try {
        const users = await User.find({ isRunning: true, apiKey: { $exists: true }, apiSecret: { $exists: true } });
        
        for (const user of users) {
            try {
                // التحقق من وجود المفاتيح
                if (!user.apiKey || !user.apiSecret) {
                    console.log(`المستخدم ${user.telegramId} ليس لديه مفاتيح API`);
                    continue;
                }

                // إنشاء اتصال مع BingX
                const exchange = new ccxt.bingx({
                    apiKey: user.apiKey,
                    secret: user.apiSecret,
                    options: { defaultType: 'spot' }
                });

                // تحليل السوق
                const ohlcv = await exchange.fetchOHLCV(user.activeSymbol, '5m', undefined, 50);
                const prices = ohlcv.map(x => x[4]);
                const currentPrice = prices[prices.length - 1];
                const rsi = RSI.calculate({period: 14, values: prices}).pop();
                const ema9 = EMA.calculate({period: 9, values: prices}).pop();
                const ema21 = EMA.calculate({period: 21, values: prices}).pop();

                // منطق التداول
                if (ema9 > ema21 && rsi < 70) {
                    // إشارة شراء
                    console.log(`📈 إشارة شراء لـ ${user.telegramId} على ${user.activeSymbol}`);
                    
                    // إرسال إشعار للمستخدم
                    await bot.sendMessage(user.telegramId, 
                        `📈 *إشارة شراء*\n\n` +
                        `الزوج: ${user.activeSymbol}\n` +
                        `السعر: ${currentPrice}\n` +
                        `RSI: ${rsi.toFixed(2)}`,
                        { parse_mode: 'Markdown' }
                    );
                    
                } else if (ema9 < ema21 && rsi > 30) {
                    // إشارة بيع
                    console.log(`📉 إشارة بيع لـ ${user.telegramId} على ${user.activeSymbol}`);
                    
                    await bot.sendMessage(user.telegramId, 
                        `📉 *إشارة بيع*\n\n` +
                        `الزوج: ${user.activeSymbol}\n` +
                        `السعر: ${currentPrice}\n` +
                        `RSI: ${rsi.toFixed(2)}`,
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

// تشغيل الخادم
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});