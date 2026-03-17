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

mongoose.connect(config.MONGO_URL).then(() => console.log("📦 Connected to MongoDB"));

const userSchema = new mongoose.Schema({
    telegramId: String,
    apiKey: String,
    apiSecret: String,
    exchangeId: String,
    symbol: String,
    amount: Number,
    active: { type: Boolean, default: false },
    lastEntryPrice: Number,
    totalProfit: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// مسارات واجهة المستخدم (API)
app.get("/get-config/:id", async (req, res) => {
    const user = await User.findOne({ telegramId: req.params.id });
    res.json(user || {});
});

app.get("/get-balance/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user || !user.apiKey) return res.json({ balance: 0 });
        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        const bal = await exchange.fetchBalance();
        res.json({ balance: bal.total.USDT || 0 });
    } catch (e) { res.json({ balance: "Error" }); }
});

app.post("/save-config", async (req, res) => {
    const data = req.body;
    await User.findOneAndUpdate({ telegramId: data.telegramId }, data, { upsert: true });
    res.json({ success: true });
});

// محرك التداول (Trend + Scalping + Risk Management)
async function runBotLogic(user) {
    if (!user.active || !user.apiKey) return;
    try {
        const exchange = new ccxt[user.exchangeId]({ apiKey: user.apiKey, apiSecret: user.apiSecret });
        const ohlcv = await exchange.fetchOHLCV(user.symbol, '5m', undefined, 250);
        const prices = ohlcv.map(x => x[4]);
        const currentPrice = prices[prices.length - 1];

        const ema200 = EMA.calculate({period: 200, values: prices}).pop();
        const ema9 = EMA.calculate({period: 9, values: prices}).pop();
        const ema21 = EMA.calculate({period: 21, values: prices}).pop();
        const rsi = RSI.calculate({period: 14, values: prices}).pop();

        const isUptrend = currentPrice > ema200;

        // منطق الشراء
        if (isUptrend && ema9 > ema21 && rsi > 50 && !user.lastEntryPrice) {
            bot.sendMessage(user.telegramId, `🚀 **دخول شراء**\nالسعر: ${currentPrice}\nالسبب: ترند صاعد + تقاطع ذهبي`);
            user.lastEntryPrice = currentPrice;
            await user.save();
        }

        // منطق الخروج
        if (user.lastEntryPrice) {
            const pnl = ((currentPrice - user.lastEntryPrice) / user.lastEntryPrice) * 100;
            if (ema9 < ema21 || pnl <= -1.5 || pnl >= 3) {
                let reason = pnl <= -1.5 ? "🔴 وقف خسارة" : (pnl >= 3 ? "🟢 جني أرباح" : "⚪ تقاطع عكسي");
                bot.sendMessage(user.telegramId, `🔔 **خروج**\nالسبب: ${reason}\nالربح: ${pnl.toFixed(2)}%`);
                user.totalProfit += pnl;
                user.lastEntryPrice = null;
                await user.save();
            }
        }
    } catch (e) { console.log("Logic Error:", e.message); }
}

setInterval(async () => {
    const users = await User.find({ active: true });
    for (const u of users) await runBotLogic(u);
}, 60000);

app.listen(process.env.PORT || 10000);