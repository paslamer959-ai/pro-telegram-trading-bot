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

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

mongoose.connect(config.MONGO_URL).then(() => console.log("📦 System Connected"));

const userSchema = new mongoose.Schema({
    telegramId: String, apiKey: String, apiSecret: String,
    exchangeId: String, symbol: String, amount: Number,
    active: { type: Boolean, default: false },
    lastEntryPrice: Number, totalProfit: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// --- مسارات الواجهة (الرصيد والحالة) ---
app.get("/get-status/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user || !user.apiSecret) return res.json({ balance: "0.00", status: "غير معدّ", pnl: 0 });

        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        if (user.exchangeId === 'bingx') exchange.urls['api'] = 'https://open-api-vst.bingx.com';

        const bal = await exchange.fetchBalance();
        const ohlcv = await exchange.fetchOHLCV(user.symbol, '5m', undefined, 200);
        const prices = ohlcv.map(x => x[4]);
        const ema200 = EMA.calculate({period: 200, values: prices}).pop();
        const trend = prices[prices.length - 1] > ema200 ? "صاعد 📈" : "هابط 📉";

        res.json({ balance: (bal.total.USDT || 0).toFixed(2), status: trend, pnl: user.totalProfit.toFixed(2), apiKey: user.apiKey, symbol: user.symbol, amount: user.amount });
    } catch (e) { res.json({ balance: "Error", status: "خطأ اتصال", pnl: 0 }); }
});

app.post("/save-config", async (req, res) => {
    await User.findOneAndUpdate({ telegramId: req.body.telegramId }, req.body, { upsert: true });
    bot.sendMessage(req.body.telegramId, "✅ تم حفظ الإعدادات بنجاح. البوت يراقب السوق الآن.");
    res.json({ success: true });
});

// --- منطق التداول الاحترافي ---
async function runBotLogic(user) {
    if (!user.active || !user.apiSecret) return;
    try {
        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        if (user.exchangeId === 'bingx') exchange.urls['api'] = 'https://open-api-vst.bingx.com';

        const ohlcv = await exchange.fetchOHLCV(user.symbol, '5m', undefined, 250);
        const prices = ohlcv.map(x => x[4]);
        const current = prices[prices.length - 1];

        const ema200 = EMA.calculate({period: 200, values: prices}).pop();
        const ema9 = EMA.calculate({period: 9, values: prices}).pop();
        const ema21 = EMA.calculate({period: 21, values: prices}).pop();
        const rsi = RSI.calculate({period: 14, values: prices}).pop();

        if (current > ema200 && ema9 > ema21 && rsi > 50 && !user.lastEntryPrice) {
            user.lastEntryPrice = current;
            await user.save();
            bot.sendMessage(user.telegramId, `🚀 **فتح صفقة شراء**\nالعملة: ${user.symbol}\nالسعر: ${current}\nالحالة: اختراق صاعد`);
        }

        if (user.lastEntryPrice) {
            const pnl = ((current - user.lastEntryPrice) / user.lastEntryPrice) * 100;
            if (ema9 < ema21 || pnl <= -1.5 || pnl >= 3.0) {
                user.totalProfit += pnl;
                user.lastEntryPrice = null;
                await user.save();
                bot.sendMessage(user.telegramId, `🔔 **إغلاق صفقة**\nالربح/الخسارة: ${pnl.toFixed(2)}%`);
            }
        }
    } catch (e) { console.log("Logic Error:", e.message); }
}

setInterval(async () => {
    const users = await User.find({ active: true });
    for (const u of users) await runBotLogic(u);
}, 60000);

app.listen(process.env.PORT || 10000);