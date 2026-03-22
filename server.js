const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const ccxt = require('ccxt');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use(require('compression')());

if (!config.BOT_TOKEN) {
    console.error('❌ Error: BOT_TOKEN not found in config.js');
    process.exit(1);
}

if (!config.MONGO_URL) {
    console.error('❌ Error: MONGO_URL not found in config.js');
    process.exit(1);
}

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
console.log('✅ Bot is running...');

mongoose.connect(config.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'TradingPro'
})
.then(() => {
    console.log('✅ Connected to database');
    console.log('📁 Database: TradingPro');
})
.catch(err => {
    console.error('❌ Database connection error:', err.message);
});

const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, required: true },
    username: String,
    firstName: String,
    lastName: String,
    
    selectedExchange: { type: String, default: 'bingx' },
    
    exchanges: {
        bingx: { apiKey: { type: String, default: '' }, apiSecret: { type: String, default: '' }, isActive: { type: Boolean, default: false } },
        binance: { apiKey: { type: String, default: '' }, apiSecret: { type: String, default: '' }, isActive: { type: Boolean, default: false } },
        bybit: { apiKey: { type: String, default: '' }, apiSecret: { type: String, default: '' }, isActive: { type: Boolean, default: false } },
        mexc: { apiKey: { type: String, default: '' }, apiSecret: { type: String, default: '' }, isActive: { type: Boolean, default: false } }
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
        stopLoss: Number,
        supportLevel: Number,
        entryTime: Date,
        orderId: String,
        highestPrice: { type: Number, default: 0 },
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

mongoose.connection.once('open', async () => {
    try {
        console.log('🔍 Checking users collection...');
        const collections = await mongoose.connection.db.listCollections({ name: 'users' }).toArray();
        if (collections.length === 0) {
            console.log('📁 Creating users collection...');
            await User.createCollection();
            console.log('✅ Users collection created');
        } else {
            console.log('✅ Users collection exists');
        }
    } catch (error) {
        console.error('❌ Collection check error:', error.message);
    }
});

const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [ { text: "🚀 Open Bot", web_app:{ url: config.WEBAPP_URL } }, { text: "📊 Market" } ],
            [ { text: "💰 My Balance" }, { text: "📈 My Profit" } ],
            [ { text: "⚙️ Settings" }, { text: "❓ Help" } ],
            [ { text: "🔄 Start Bot" }, { text: "🛑 Stop Bot" } ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        selective: true
    }
};

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    const firstName = msg.from.first_name || 'User';
    const username = msg.from.username || '';
    
    try {
        const user = await User.findOneAndUpdate(
            { telegramId },
            { $set: { firstName, username, lastActive: new Date() }, $setOnInsert: { telegramId, createdAt: new Date(), favoriteSymbols: [], tradeAmount: 1.2 } },
            { upsert: true, new: true }
        );

        const welcomeMessage = `
🌟 *Welcome ${firstName} to Trading Bot!* 🌟

╔════════════════════╗
║   🚀 *TRADING PRO*   ║
╚════════════════════╝

📊 *Your Account:*
• ✅ Data saved
• 💰 Total Profit: *${user.totalProfit} USDT*
• ⭐ Favorites: *${user.favoriteSymbols.length}*
• 💵 Trade Amount: *${user.tradeAmount} USDT*
• 🔄 Bot Status: ${user.isRunning ? '✅ Running' : '⏸️ Stopped'}

📈 *Trading Strategy:*
• 📍 Strong Support Level
• 📉 RSI < 35 (Oversold)
• 🔨 Hammer Candle Pattern
• 📊 High Volume Confirmation
• 🛑 Stop Loss Below Support (0.5%)
• 📈 Trailing Stop (Profit Unlimited)
• ⏱️ Timeframe: 1 minute | Candles: 25

⬇️ *Click below to open the app:* ⬇️
        `;

        await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...mainKeyboard });
        await bot.sendMessage(chatId, '🚀 *Open Mini App*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🌟 Click to Open", web_app: { url: config.WEBAPP_URL } }]] }
        });

    } catch (error) {
        console.error('Start command error:', error);
        await bot.sendMessage(chatId, '❌ Error, please try again');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const telegramId = msg.from.id.toString();

    if (text.startsWith('/')) return;

    try {
        const user = await User.findOne({ telegramId });
        if (!user && text !== '🚀 Open Bot') return bot.sendMessage(chatId, '❌ Please send /start first');

        switch(text) {
            case '🚀 Open Bot':
                await bot.sendMessage(chatId, '🚀 Opening bot...', {
                    reply_markup: { inline_keyboard: [[{ text: "🌟 Open App", web_app: { url: config.WEBAPP_URL } }]] }
                });
                break;

            case '📊 Market':
                try {
                    const exchange = new ccxt.bingx();
                    const tickers = await exchange.fetchTickers(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
                    await bot.sendMessage(chatId, `
📊 *Market Status:*

₿ *BTC/USDT*: $${tickers['BTC/USDT'].last?.toFixed(2) || '0'} (${tickers['BTC/USDT'].percentage?.toFixed(2) || '0'}%)
⟠ *ETH/USDT*: $${tickers['ETH/USDT'].last?.toFixed(2) || '0'} (${tickers['ETH/USDT'].percentage?.toFixed(2) || '0'}%)
◎ *SOL/USDT*: $${tickers['SOL/USDT'].last?.toFixed(2) || '0'} (${tickers['SOL/USDT'].percentage?.toFixed(2) || '0'}%)`, 
                    { parse_mode: 'Markdown', ...mainKeyboard });
                } catch (error) { await bot.sendMessage(chatId, '❌ Market data error', mainKeyboard); }
                break;

            case '💰 My Balance':
                await bot.sendMessage(chatId, `
💰 *Your Balance:*
• Platform: *${user?.selectedExchange.toUpperCase()}*
• Profit/Loss: *${user?.totalProfit || 0} USDT*
• Total Trades: *${user?.totalTrades || 0}*
• Win Rate: *${user?.winRate || 0}%*
• Trade Amount: *${user?.tradeAmount || 1.2} USDT*
• Bot Status: ${user?.isRunning ? '✅ Running' : '⏸️ Stopped'}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '📈 My Profit':
                await bot.sendMessage(chatId, `
📊 *Profit Statistics:*
💰 Total Profit: *${user?.totalProfit || 0} USDT*
🔄 Total Trades: *${user?.totalTrades || 0}*
📊 Win Rate: *${user?.winRate || 0}%*
⭐ Favorite Symbols: *${user?.favoriteSymbols?.length || 0}*
💵 Trade Amount: *${user?.tradeAmount || 1.2} USDT*
${user?.isRunning ? '✅ Bot Running' : '⏸️ Bot Stopped'}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '⚙️ Settings':
                await bot.sendMessage(chatId, `⚙️ *Settings*\n\n• API Keys for exchanges\n• Select active exchange\n• Trade amount: ${user?.tradeAmount || 1.2} USDT\n• Strategy: Support + RSI<35 + Hammer + Volume\n• Timeframe: 1 minute\n\nOpen app to change settings`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "⚙️ Open Settings", web_app: { url: config.WEBAPP_URL } }]] }
                });
                break;

            case '❓ Help':
                await bot.sendMessage(chatId, `❓ *Help*\n\n*Commands:*\n• /start - Main menu\n• /balance - Balance\n• /stop - Stop bot\n\n*Trading Strategy:*\n• Timeframe: 1 minute (25 candles)\n• Price near strong support\n• RSI < 35 (oversold)\n• Hammer candle pattern\n• High volume confirmation\n• Stop loss below support (0.5%)\n• Trailing stop (unlimited profit)\n\nSupport: ${config.SUPPORT_CHAT}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '🔄 Start Bot':
                await User.findOneAndUpdate({ telegramId }, { isRunning: true });
                await bot.sendMessage(chatId, `✅ *Bot Started*\n\nSearching for trading opportunities using Support + RSI + Hammer strategy (1min timeframe)`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '🛑 Stop Bot':
                await User.findOneAndUpdate({ telegramId }, { isRunning: false });
                await bot.sendMessage(chatId, `🛑 *Bot Stopped*`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            default:
                await bot.sendMessage(chatId, `❓ Unknown command\nUse the buttons in the menu`, mainKeyboard);
        }
    } catch (error) {
        console.error('Message handler error:', error);
        await bot.sendMessage(chatId, '❌ Error, please try again', mainKeyboard);
    }
});

app.get("/api/user-data/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user) return res.json({ error: 'User not found' });
        res.json(user);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/real-balance/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user) return res.json({ success: false, balance: 0 });
        try {
            const ExchangeClass = ccxt[user.selectedExchange];
            if (!ExchangeClass) return res.json({ success: false, balance: 0 });
            const exchange = new ExchangeClass({ apiKey: user.exchanges[user.selectedExchange]?.apiKey, secret: user.exchanges[user.selectedExchange]?.apiSecret, timeout: 30000, enableRateLimit: true });
            const balance = await exchange.fetchBalance();
            res.json({ success: true, balance: balance.USDT?.free || 0, exchange: user.selectedExchange });
        } catch { res.json({ success: false, balance: 0 }); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/add-to-favorites", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.favoriteSymbols.some(f => f.symbol === symbol)) {
            user.favoriteSymbols.push({ symbol, exchange: user.selectedExchange, lastActive: new Date() });
            user.tradeAmount = amount || 1.2;
            await user.save();
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/remove-from-favorites", async (req, res) => {
    try {
        const { telegramId, symbol } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.favoriteSymbols = user.favoriteSymbols.filter(f => f.symbol !== symbol);
        await user.save();
        res.json({ success: true, message: `✅ Removed ${symbol} from favorites` });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/save-exchange-keys", async (req, res) => {
    try {
        const { telegramId, exchange, apiKey, apiSecret } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.exchanges[exchange].apiKey = apiKey;
        user.exchanges[exchange].apiSecret = apiSecret;
        user.exchanges[exchange].isActive = true;
        await user.save();
        res.json({ success: true, message: '✅ API keys saved successfully' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/set-active-exchange", async (req, res) => {
    try {
        const { telegramId, exchange } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.selectedExchange = exchange;
        await user.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/market-scan/:id", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.params.id });
        if (!user) return res.json({ results: [], balance: 0, isRunning: false });
        const exchange = new ccxt.bingx();
        let results = [];
        for (let fav of user.favoriteSymbols) {
            try {
                const ticker = await exchange.fetchTicker(fav.symbol);
                results.push({ symbol: fav.symbol, price: ticker.last?.toFixed(2) || '0', change: ticker.percentage?.toFixed(2) || '0', exchange: fav.exchange });
            } catch (e) { console.log(`Error fetching ${fav.symbol}:`, e.message); }
        }
        res.json({ results, balance: user.totalProfit, isRunning: user.isRunning, activeSymbol: user.activeSymbol });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post("/api/start-bot", async (req, res) => {
    try {
        const { telegramId, symbol, amount } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.favoriteSymbols.some(f => f.symbol === symbol)) user.favoriteSymbols.push({ symbol, exchange: user.selectedExchange, lastActive: new Date() });
        user.activeSymbol = symbol;
        user.tradeAmount = amount || 1.2;
        user.isRunning = true;
        await user.save();
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get("/api/available-symbols", async (req, res) => {
    try {
        const exchange = new ccxt.bingx();
        const markets = await exchange.loadMarkets();
        res.json({ success: true, symbols: Object.keys(markets).filter(s => s.endsWith('/USDT')).sort(), total: 0 });
    } catch (error) { res.status(500).json({ success: false, error: error.message, symbols: [] }); }
});

function calculateSMA(prices, period) {
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += prices[i - j];
        sma.push(sum / period);
    }
    return sma;
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return [50];
    const gains = [], losses = [];
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
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

function calculateSupportLines(prices, tolerance = 0.005) {
    const supports = [];
    for (let i = 2; i < prices.length - 2; i++) {
        if (prices[i] < prices[i-1] && prices[i] < prices[i-2] && prices[i] < prices[i+1] && prices[i] < prices[i+2]) {
            let found = false;
            for (let s of supports) {
                if (Math.abs(s.price - prices[i]) / prices[i] < tolerance) {
                    s.touchCount++;
                    s.lastTouch = i;
                    found = true;
                    break;
                }
            }
            if (!found) supports.push({ price: prices[i], touchCount: 1, lastTouch: i });
        }
    }
    supports.sort((a, b) => b.touchCount - a.touchCount);
    return supports.slice(0, 5);
}

function isNearSupport(currentPrice, supports, threshold = 0.002) {
    for (let s of supports) {
        if (Math.abs(currentPrice - s.price) / currentPrice < threshold) return { isNear: true, support: s.price, strength: s.touchCount };
    }
    return { isNear: false };
}

function checkVolumeConfirmation(volumes, index, period = 4) {
    const currentVol = volumes[index];
    const avgVol = volumes.slice(index - period, index).reduce((a, b) => a + b, 0) / period;
    return currentVol > avgVol * 1.5;
}

function checkCandlestickPattern(candle) {
    const body = Math.abs(candle[4] - candle[1]);
    const lowerWick = Math.min(candle[1], candle[4]) - candle[3];
    const upperWick = candle[2] - Math.max(candle[1], candle[4]);
    if (lowerWick > body * 2 && upperWick < body * 0.5 && candle[4] > candle[1]) return 'hammer';
    return null;
}

async function getExchangeConnection(user) {
    const exchangeName = user.selectedExchange || 'bingx';
    const exchangeConfig = user.exchanges[exchangeName];
    if (!exchangeConfig || !exchangeConfig.apiKey || !exchangeConfig.apiSecret) throw new Error(`❌ ${exchangeName} API keys missing`);
    let exchange;
    switch(exchangeName) {
        case 'bingx': exchange = new ccxt.bingx({ apiKey: exchangeConfig.apiKey, secret: exchangeConfig.apiSecret, timeout: 30000, enableRateLimit: true, options: { defaultType: 'spot' } }); break;
        case 'binance': exchange = new ccxt.binance({ apiKey: exchangeConfig.apiKey, secret: exchangeConfig.apiSecret, timeout: 30000, enableRateLimit: true, options: { defaultType: 'spot' } }); break;
        case 'bybit': exchange = new ccxt.bybit({ apiKey: exchangeConfig.apiKey, secret: exchangeConfig.apiSecret, timeout: 30000, enableRateLimit: true, options: { defaultType: 'spot' } }); break;
        case 'mexc': exchange = new ccxt.mexc({ apiKey: exchangeConfig.apiKey, secret: exchangeConfig.apiSecret, timeout: 30000, enableRateLimit: true, options: { defaultType: 'spot' } }); break;
        default: throw new Error('❌ Exchange not supported');
    }
    await exchange.loadMarkets();
    return exchange;
}

async function openNewTrade(user, symbol, entryPrice, supportLevel, stopLoss, exchange) {
    const MIN_TRADE_AMOUNT = 1.20;
    try {
        const balance = await exchange.fetchBalance();
        const usdtBalance = balance.USDT?.free || 0;
        if (usdtBalance < MIN_TRADE_AMOUNT) { console.log(`❌ Insufficient balance: ${usdtBalance} USDT`); return; }
        const amountToUse = Math.min(user.tradeAmount || 1.2, usdtBalance * 0.95);
        if (amountToUse < MIN_TRADE_AMOUNT) { console.log(`❌ Amount below minimum`); return; }
        
        console.log(`🟢 Opening trade on ${symbol} with ${amountToUse.toFixed(2)} USDT | Stop: ${stopLoss.toFixed(4)} (below support ${supportLevel.toFixed(4)})`);
        const order = await exchange.createMarketBuyOrder(symbol, amountToUse / entryPrice);
        
        await User.findOneAndUpdate({ telegramId: user.telegramId }, {
            $set: {
                currentTrade: { symbol, exchange: user.selectedExchange, entryPrice, stopLoss, supportLevel, entryTime: new Date(), orderId: order.id, highestPrice: entryPrice, status: 'open' },
                lastTradeTime: new Date()
            }
        });

        await bot.sendMessage(user.telegramId, `
🟢 *New Trade - ${symbol}*

💰 Amount: ${amountToUse.toFixed(2)} USDT
📊 Entry Price: $${entryPrice.toFixed(4)}
📉 Support Level: $${supportLevel.toFixed(4)}
🛑 Stop Loss: $${stopLoss.toFixed(4)} (0.5% below support)
📈 Profit: Unlimited (Trailing Stop)
⏱️ Timeframe: 1 minute | Candles: 25

⚠️ *If price breaks support → immediate exit*

⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    } catch (error) { console.error(`❌ Buy failed:`, error.message); await bot.sendMessage(user.telegramId, `❌ Buy failed: ${error.message}`); }
}

async function handleOpenTrade(user, exchange) {
    const trade = user.currentTrade;
    try {
        const ticker = await exchange.fetchTicker(trade.symbol);
        const currentPrice = ticker.last;
        const bidPrice = ticker.bid;
        
        let highestPrice = trade.highestPrice || trade.entryPrice;
        if (currentPrice > highestPrice) {
            highestPrice = currentPrice;
            await User.findOneAndUpdate({ telegramId: user.telegramId }, { $set: { 'currentTrade.highestPrice': highestPrice } });
        }
        
        const trailingStop = highestPrice * 0.9975;
        const fixedStop = trade.stopLoss;
        
        let exitReason = '', shouldExit = false;
        
        if (bidPrice <= fixedStop) {
            shouldExit = true;
            exitReason = `❌ Support broken at ${trade.supportLevel.toFixed(4)} (exit at ${fixedStop.toFixed(4)})`;
        }
        else if (bidPrice <= trailingStop && highestPrice > trade.entryPrice * 1.0025) {
            shouldExit = true;
            exitReason = `🛑 Trailing stop hit (0.25% below high ${highestPrice.toFixed(4)})`;
        }
        
        if (shouldExit) {
            await closeTrade(user, currentPrice, exitReason, exchange);
        } else {
            console.log(`👀 ${trade.symbol} | Price: $${currentPrice} | Support: $${trade.supportLevel} | Stop: $${fixedStop} | High: $${highestPrice} | Trail: $${trailingStop}`);
        }
    } catch (error) {
        console.error(`Trade monitoring error:`, error.message);
    }
}

async function closeTrade(user, exitPrice, reason, exchange) {
    const trade = user.currentTrade;
    try {
        const balance = await exchange.fetchBalance();
        const cryptoBalance = balance[trade.symbol.split('/')[0]]?.free || 0;
        if (cryptoBalance > 0) await exchange.createMarketSellOrder(trade.symbol, cryptoBalance);
        
        const profitPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const profitAmount = (user.tradeAmount || 1.2) * (profitPercent / 100);
        const newTotalProfit = (user.totalProfit || 0) + profitAmount;
        const newTotalTrades = (user.totalTrades || 0) + 1;
        const winCount = (user.tradeHistory?.filter(t => t.profit > 0).length || 0) + (profitPercent > 0 ? 1 : 0);
        const newWinRate = (winCount / newTotalTrades) * 100;
        
        await User.findOneAndUpdate({ telegramId: user.telegramId }, {
            $set: { currentTrade: { status: 'closed' }, totalProfit: newTotalProfit, totalTrades: newTotalTrades, winRate: newWinRate },
            $push: { tradeHistory: { symbol: trade.symbol, entryPrice: trade.entryPrice, exitPrice, profit: profitAmount, profitPercent, entryTime: trade.entryTime, exitTime: new Date(), reason } }
        });
        
        const emoji = profitPercent > 0 ? '✅' : '❌';
        await bot.sendMessage(user.telegramId, `
${emoji} *Trade Closed*

📊 ${trade.symbol}
💰 P/L: ${profitPercent > 0 ? '+' : ''}${profitPercent.toFixed(2)}%
💵 Amount: $${Math.abs(profitAmount).toFixed(2)} USDT
📝 Reason: ${reason}
📈 Win Rate: ${newWinRate.toFixed(1)}%

⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    } catch (error) { console.error(`❌ Sell failed:`, error.message); }
}

async function findNewTradeOpportunity(user, exchange) {
    const exchangeName = user.selectedExchange;
    const favoriteSymbols = user.favoriteSymbols.filter(f => f.exchange === exchangeName).map(f => f.symbol);
    if (user.activeSymbol && !favoriteSymbols.includes(user.activeSymbol)) favoriteSymbols.push(user.activeSymbol);
    
    for (const symbol of favoriteSymbols) {
        try {
            // ✅ التعديل: فريم 1 دقيقة، 25 شمعة
            const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 25);
            if (ohlcv.length < 12) continue;
            const prices = ohlcv.map(c => c[4]);
            const volumes = ohlcv.map(c => c[5]);
            const currentPrice = prices[prices.length - 1];
            
            const supports = calculateSupportLines(prices);
            const nearSupport = isNearSupport(currentPrice, supports);
            const rsi = calculateRSI(prices, 14);
            const oversold = rsi[rsi.length - 1] < 35;
            const pattern = checkCandlestickPattern(ohlcv[ohlcv.length - 1]);
            const volumeConfirm = checkVolumeConfirmation(volumes, volumes.length - 1);
            
            if (nearSupport.isNear && oversold && pattern === 'hammer' && volumeConfirm) {
                const stopLoss = nearSupport.support * 0.995;
                console.log(`✅✅✅ Opportunity on ${symbol}: Support ${nearSupport.support} | RSI: ${rsi[rsi.length-1].toFixed(2)} | Strength: ${nearSupport.strength} | Timeframe: 1min`);
                await openNewTrade(user, symbol, currentPrice, nearSupport.support, stopLoss, exchange);
                return true;
            }
        } catch (error) { console.log(`Error scanning ${symbol}:`, error.message); }
    }
    return false;
}

async function executeTrading() {
    try {
        const users = await User.find({ isRunning: true });
        for (const user of users) {
            try {
                const exchange = await getExchangeConnection(user);
                if (user.currentTrade?.status === 'open') await handleOpenTrade(user, exchange);
                else await findNewTradeOpportunity(user, exchange);
            } catch (userError) { console.error(`Error for user ${user.telegramId}:`, userError.message); }
        }
    } catch (error) { console.error('Trading system error:', error); }
}

setInterval(executeTrading, 30 * 1000);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'alive', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date().toISOString(), version: '6.0.0', strategy: 'Support + RSI<35 + Hammer + Volume + Stop under Support + 1min timeframe' }));

function startKeepAlive() {
    const https = require('https');
    const url = config.WEBAPP_URL;
    setInterval(() => { https.get(url, () => {}).on('error', () => {}); setTimeout(() => https.get(`${url}/health`, () => {}).on('error', () => {}), 1000); }, 5 * 60 * 1000);
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Bot: https://t.me/${config.BOT_USERNAME}`);
    console.log(`📈 Strategy: Support + RSI<35 + Hammer + Volume + Stop under Support + Trailing Stop`);
    console.log(`⏱️ Timeframe: 1 minute | Candles: 25`);
    startKeepAlive();
});

process.on('SIGINT', () => { console.log('🛑 Shutting down...'); bot.stopPolling(); mongoose.connection.close(); process.exit(); });