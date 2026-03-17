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
mongoose.connect(config.MONGO_URL);

const userSchema = new mongoose.Schema({
    telegramId: String, apiKey: String, apiSecret: String,
    activeSymbol: { type: String, default: 'BTC/USDT' },
    tradeAmount: { type: Number, default: 0 },
    isRunning: { type: Boolean, default: false },
    totalProfit: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// جلب بيانات الصفحة الرئيسية (تحليل العملات)
app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        const exchange = new ccxt.bingx();
        const symbols = ['BTC/USDT', 'ETH/USDT', 'AR/USDT', 'SOL/USDT'];
        let results = [];

        for (let sym of symbols) {
            const ohlcv = await exchange.fetchOHLCV(sym, '5m', undefined, 100);
            const prices = ohlcv.map(x => x[4]);
            const current = prices[prices.length - 1];
            const rsi = RSI.calculate({period: 14, values: prices}).pop();
            const ema9 = EMA.calculate({period: 9, values: prices}).pop();
            const ema21 = EMA.calculate({period: 21, values: prices}).pop();

            results.push({
                symbol: sym,
                price: current,
                rsi: rsi.toFixed(2),
                signal: (ema9 > ema21 && rsi > 50) ? 'BUY' : (ema9 < ema21 ? 'SELL' : 'WAIT'),
                change: ((current - prices[0]) / prices[0] * 100).toFixed(2)
            });
        }
        res.json({ results, balance: user ? user.totalProfit : 0 });
    } catch (e) { res.status(500).send(e.message); }
});

// حفظ الإعدادات (ثابتة لا تضيع)
app.post("/api/save-keys", async (req, res) => {
    await User.findOneAndUpdate({ telegramId: req.body.telegramId }, req.body, { upsert: true });
    res.json({ success: true });
});

// تشغيل البوت على عملة محددة
app.post("/api/start-bot", async (req, res) => {
    const { telegramId, symbol, amount } = req.body;
    await User.findOneAndUpdate({ telegramId }, { activeSymbol: symbol, tradeAmount: amount, isRunning: true });
    res.json({ success: true });
});

app.get("/api/user-data/:id", async (req, res) => {
    const user = await User.findOne({ telegramId: req.params.id });
    res.json(user || {});
});

app.listen(process.env.PORT || 10000);