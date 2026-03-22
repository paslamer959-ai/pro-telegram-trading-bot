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
        takeProfit: Number,
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
            [ { text: "🔄 Start Bot" }, { text: "🛑 Stop Bot" } ],
            [ { text: "📊 Bot Status" } ]
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
• 💰 Total Profit: *${user.totalProfit.toFixed(4)} USDT*
• ⭐ Favorites: *${user.favoriteSymbols.length}*
• 💵 Trade Amount: *${user.tradeAmount} USDT*
• 🔄 Bot Status: ${user.isRunning ? '✅ Running' : '⏸️ Stopped'}

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

bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return bot.sendMessage(chatId, '❌ Please send /start first');
        
        await bot.sendMessage(chatId, `
💰 *Your Balance:*
• Platform: *${user.selectedExchange.toUpperCase()}*
• Profit/Loss: *${(user.totalProfit || 0).toFixed(4)} USDT*
• Total Trades: *${user.totalTrades || 0}*
• Win Rate: *${user.winRate || 0}%*
• Trade Amount: *${user.tradeAmount || 1.2} USDT*
• Bot Status: ${user.isRunning ? '✅ Running' : '⏸️ Stopped'}`, { parse_mode: 'Markdown', ...mainKeyboard });
    } catch (error) {
        console.error('Balance command error:', error);
        await bot.sendMessage(chatId, '❌ Error, please try again');
    }
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        await User.findOneAndUpdate({ telegramId }, { isRunning: false });
        await bot.sendMessage(chatId, `🛑 *Bot Stopped*`, { parse_mode: 'Markdown', ...mainKeyboard });
    } catch (error) {
        console.error('Stop command error:', error);
        await bot.sendMessage(chatId, '❌ Error, please try again');
    }
});

bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return bot.sendMessage(chatId, '❌ Please send /start first');
        
        let statusMessage = `
📊 *Bot Status Report*

╔════════════════════════╗
║  🤖 *SYSTEM STATUS*    ║
╚════════════════════════╝

• Bot State: ${user.isRunning ? '🟢 ACTIVE' : '⚫ INACTIVE'}
• Active Exchange: *${user.selectedExchange.toUpperCase()}*
• Trading Pair: *${user.activeSymbol || 'Not set'}*
• Trade Amount: *${user.tradeAmount} USDT*

📈 *Performance:*
• Total Profit: *${(user.totalProfit || 0).toFixed(4)} USDT*
• Total Trades: *${user.totalTrades || 0}*
• Win Rate: *${user.winRate || 0}%*

`;

        if (user.currentTrade && user.currentTrade.status === 'open') {
            const entryTime = new Date(user.currentTrade.entryTime);
            const now = new Date();
            const duration = Math.floor((now - entryTime) / (60 * 1000));
            statusMessage += `
🟢 *Active Trade:*
• Symbol: *${user.currentTrade.symbol}*
• Entry: *$${user.currentTrade.entryPrice?.toFixed(4) || 'N/A'}*
• Duration: *${duration} minutes*
• Status: *IN PROGRESS*
`;
        } else {
            statusMessage += `
⚪ *Active Trade:*
• Status: *No active trades*
`;
        }

        statusMessage += `
⭐ *Favorites:* ${user.favoriteSymbols?.length || 0} symbols
📅 *Last Active:* ${new Date(user.lastActive).toLocaleString()}

🟢 *System: Operational*`;
        
        await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown', ...mainKeyboard });
    } catch (error) {
        console.error('Status command error:', error);
        await bot.sendMessage(chatId, '❌ Error getting status', mainKeyboard);
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const telegramId = msg.from.id.toString();

    if (text && text.startsWith('/')) return;

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
• Profit/Loss: *${(user?.totalProfit || 0).toFixed(4)} USDT*
• Total Trades: *${user?.totalTrades || 0}*
• Win Rate: *${user?.winRate || 0}%*
• Trade Amount: *${user?.tradeAmount || 1.2} USDT*
• Bot Status: ${user?.isRunning ? '✅ Running' : '⏸️ Stopped'}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '📈 My Profit':
                await bot.sendMessage(chatId, `
📊 *Profit Statistics:*
💰 Total Profit: *${(user?.totalProfit || 0).toFixed(4)} USDT*
🔄 Total Trades: *${user?.totalTrades || 0}*
📊 Win Rate: *${user?.winRate || 0}%*
⭐ Favorite Symbols: *${user?.favoriteSymbols?.length || 0}*
💵 Trade Amount: *${user?.tradeAmount || 1.2} USDT*
${user?.isRunning ? '✅ Bot Running' : '⏸️ Bot Stopped'}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '📊 Bot Status':
                let statusMessage = `
📊 *Bot Status Report*

╔════════════════════════╗
║  🤖 *SYSTEM STATUS*    ║
╚════════════════════════╝

• Bot State: ${user?.isRunning ? '🟢 ACTIVE' : '⚫ INACTIVE'}
• Active Exchange: *${user?.selectedExchange.toUpperCase()}*
• Trading Pair: *${user?.activeSymbol || 'Not set'}*
• Trade Amount: *${user?.tradeAmount} USDT*

📈 *Performance:*
• Total Profit: *${(user?.totalProfit || 0).toFixed(4)} USDT*
• Total Trades: *${user?.totalTrades || 0}*
• Win Rate: *${user?.winRate || 0}%*

`;

                if (user?.currentTrade && user.currentTrade.status === 'open') {
                    const entryTime = new Date(user.currentTrade.entryTime);
                    const now = new Date();
                    const duration = Math.floor((now - entryTime) / (60 * 1000));
                    statusMessage += `
🟢 *Active Trade:*
• Symbol: *${user.currentTrade.symbol}*
• Entry: *$${user.currentTrade.entryPrice?.toFixed(4) || 'N/A'}*
• Duration: *${duration} minutes*
• Status: *IN PROGRESS*
`;
                } else {
                    statusMessage += `
⚪ *Active Trade:*
• Status: *No active trades*
`;
                }

                statusMessage += `
⭐ *Favorites:* ${user?.favoriteSymbols?.length || 0} symbols
📅 *Last Active:* ${new Date(user?.lastActive).toLocaleString()}

🟢 *System: Operational*`;
                
                await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '⚙️ Settings':
                await bot.sendMessage(chatId, `⚙️ *Settings*\n\n• API Keys for exchanges\n• Select active exchange\n• Trade amount: ${user?.tradeAmount || 1.2} USDT\n\nOpen app to change settings`, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "⚙️ Open Settings", web_app: { url: config.WEBAPP_URL } }]] }
                });
                break;

            case '❓ Help':
                const userStatusHelp = await User.findOne({ telegramId });
                const botStatusHelp = userStatusHelp?.isRunning ? '✅ Running' : '⏸️ Stopped';
                const currentBalanceHelp = userStatusHelp?.totalProfit?.toFixed(4) || '0.0000';
                const totalTradesHelp = userStatusHelp?.totalTrades || 0;
                const winRateHelp = userStatusHelp?.winRate?.toFixed(1) || '0';
                
                await bot.sendMessage(chatId, `
❓ *Help*

*Commands:*
• /start - Main menu
• /balance - Balance
• /stop - Stop bot
• /status - Bot status

*Bot Status:*
• 🤖 Bot: ${botStatusHelp}
• 💰 Total Profit: *${currentBalanceHelp} USDT*
• 📊 Total Trades: *${totalTradesHelp}*
• 📈 Win Rate: *${winRateHelp}%*

Support: ${config.SUPPORT_CHAT}`, { parse_mode: 'Markdown', ...mainKeyboard });
                break;

            case '🔄 Start Bot':
                await User.findOneAndUpdate({ telegramId }, { isRunning: true });
                await bot.sendMessage(chatId, `✅ *Bot Started*\n\nBot is now active and monitoring markets.`, { parse_mode: 'Markdown', ...mainKeyboard });
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

// ========== دوال المؤشرات المحسنة ==========

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

function calculateStdDev(prices, sma, period) {
    let sum = 0;
    const recentPrices = prices.slice(-period);
    for (let price of recentPrices) {
        sum += Math.pow(price - sma, 2);
    }
    return Math.sqrt(sum / period);
}

function checkVolumeConfirmation(volumes, index, period = 4) {
    if (index < period) return true;
    const currentVol = volumes[index];
    const avgVol = volumes.slice(index - period, index).reduce((a, b) => a + b, 0) / period;
    return currentVol > avgVol * 1.2;
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

async function openNewTradeMeanReversion(user, symbol, entryPrice, stopLoss, takeProfit, exchange) {
    const MIN_TRADE_AMOUNT = 1.20;
    try {
        const balance = await exchange.fetchBalance();
        const usdtBalance = balance.USDT?.free || 0;
        if (usdtBalance < MIN_TRADE_AMOUNT) { console.log(`❌ Insufficient balance: ${usdtBalance} USDT`); return; }
        const amountToUse = Math.min(user.tradeAmount || 1.2, usdtBalance * 0.95);
        if (amountToUse < MIN_TRADE_AMOUNT) { console.log(`❌ Amount below minimum`); return; }
        
        console.log(`🟢 Opening trade on ${symbol} with ${amountToUse.toFixed(2)} USDT`);
        const order = await exchange.createMarketBuyOrder(symbol, amountToUse / entryPrice);
        
        await User.findOneAndUpdate({ telegramId: user.telegramId }, {
            $set: {
                currentTrade: { symbol, exchange: user.selectedExchange, entryPrice, takeProfit, stopLoss, entryTime: new Date(), orderId: order.id, highestPrice: entryPrice, status: 'open' },
                lastTradeTime: new Date()
            }
        });

        await bot.sendMessage(user.telegramId, `
🟢 *New Trade - ${symbol}*

💰 Amount: ${amountToUse.toFixed(2)} USDT
📊 Entry Price: $${entryPrice.toFixed(4)}
🎯 Target: $${takeProfit.toFixed(4)}
🛑 Stop Loss: $${stopLoss.toFixed(4)}

⏰ ${new Date().toLocaleString()}`, { parse_mode: 'Markdown' });
    } catch (error) { console.error(`❌ Buy failed:`, error.message); await bot.sendMessage(user.telegramId, `❌ Buy failed: ${error.message}`); }
}

async function handleOpenTradeMeanReversion(user, exchange) {
    const trade = user.currentTrade;
    try {
        const ticker = await exchange.fetchTicker(trade.symbol);
        const currentPrice = ticker.last;
        
        const entryTime = new Date(trade.entryTime).getTime();
        const currentTime = new Date().getTime();
        const minutesPassed = Math.floor((currentTime - entryTime) / (60 * 1000));
        
        let exitReason = '', shouldExit = false;
        let exitPrice = currentPrice;
        
        if (!trade.takeProfit) {
            console.log(`⚠️ Old trade ${trade.symbol} - using trailing stop instead`);
            
            let highestPrice = trade.highestPrice || trade.entryPrice;
            if (currentPrice > highestPrice) {
                highestPrice = currentPrice;
                await User.findOneAndUpdate({ telegramId: user.telegramId }, { $set: { 'currentTrade.highestPrice': highestPrice } });
            }
            
            const trailingStop = highestPrice * 0.9975;
            const fixedStop = trade.stopLoss;
            
            if (currentPrice <= fixedStop) {
                shouldExit = true;
                exitReason = `❌ Stop loss hit`;
                exitPrice = fixedStop;
            }
            else if (currentPrice <= trailingStop && highestPrice > trade.entryPrice * 1.0025) {
                shouldExit = true;
                exitReason = `🛑 Trailing stop hit`;
                exitPrice = trailingStop;
            }
            else if (minutesPassed >= 45) {
                shouldExit = true;
                exitReason = `⏱️ Time limit reached`;
                exitPrice = currentPrice;
            }
            
            if (shouldExit) {
                await closeTradeMeanReversion(user, exitPrice, exitReason, exchange);
            } else {
                console.log(`👀 ${trade.symbol} | Price: $${currentPrice} | Time: ${minutesPassed}/45 min`);
            }
            return;
        }
        
        if (currentPrice >= trade.takeProfit) {
            shouldExit = true;
            exitReason = `✅ Target reached`;
            exitPrice = trade.takeProfit;
        }
        else if (currentPrice <= trade.stopLoss) {
            shouldExit = true;
            exitReason = `❌ Stop loss hit`;
            exitPrice = trade.stopLoss;
        }
        else if (minutesPassed >= 45) {
            shouldExit = true;
            exitReason = `⏱️ Time limit reached`;
            exitPrice = currentPrice;
        }
        
        if (shouldExit) {
            await closeTradeMeanReversion(user, exitPrice, exitReason, exchange);
        } else {
            console.log(`👀 ${trade.symbol} | Price: $${currentPrice} | Target: $${trade.takeProfit} | Stop: $${trade.stopLoss} | Time: ${minutesPassed}/45 min`);
        }
        
    } catch (error) {
        console.error(`Trade monitoring error:`, error.message);
    }
}

async function closeTradeMeanReversion(user, exitPrice, reason, exchange) {
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

// ========== دالة البحث عن فرص التداول مع الفلاتر المحسنة ==========

async function findNewTradeOpportunity(user, exchange) {
    const exchangeName = user.selectedExchange;
    const favoriteSymbols = user.favoriteSymbols.filter(f => f.exchange === exchangeName).map(f => f.symbol);
    if (user.activeSymbol && !favoriteSymbols.includes(user.activeSymbol)) favoriteSymbols.push(user.activeSymbol);
    
    for (const symbol of favoriteSymbols) {
        try {
            // جلب بيانات الشموع (آخر 100 شمعة لضمان توفر البيانات)
            const ohlcv = await exchange.fetchOHLCV(symbol, '15m', undefined, 100);
            if (ohlcv.length < 50) {
                console.log(`⏸️ ${symbol}: بيانات غير كافية (${ohlcv.length}/50)`);
                continue;
            }
            
            const prices = ohlcv.map(c => c[4]); // سعر الإغلاق
            const volumes = ohlcv.map(c => c[5]); // حجم التداول
            const currentPrice = prices[prices.length - 1];
            
            // حساب المؤشرات
            const sma20 = calculateSMA(prices, 20);
            const sma50 = calculateSMA(prices, 50);
            const currentSMA20 = sma20[sma20.length - 1];
            const currentSMA50 = sma50[sma50.length - 1];
            
            const rsi = calculateRSI(prices, 14);
            const currentRSI = rsi[rsi.length - 1];
            
            // ========== الفلتر 1: الاتجاه العام ==========
            // لا ندخل في صفقات شراء إذا كان السوق في اتجاه هابط (SMA20 أقل من SMA50)
            if (currentSMA20 <= currentSMA50) {
                console.log(`⏸️ ${symbol}: فلتر الاتجاه - SMA20 (${currentSMA20.toFixed(2)}) <= SMA50 (${currentSMA50.toFixed(2)}) - اتجاه هابط`);
                continue;
            }
            
            // ========== الفلتر 2: تأكيد الارتداد ==========
            // ننتظر شمعة خضراء كتأكيد أن السعر بدأ بالارتداد
            const lastClose = prices[prices.length - 1];
            const prevClose = prices[prices.length - 2];
            if (lastClose <= prevClose) {
                console.log(`⏸️ ${symbol}: فلتر التأكيد - لم يحدث ارتداد بعد (آخر سعر ${lastClose.toFixed(2)} <= سابق ${prevClose.toFixed(2)})`);
                continue;
            }
            
            // ========== الفلتر 3: RSI ليس منخفضاً جداً ==========
            // إذا كان RSI أقل من 20، السوق في هطول شديد، نتجنب الدخول
            if (currentRSI < 20) {
                console.log(`⏸️ ${symbol}: فلتر RSI - منخفض جداً (${currentRSI.toFixed(2)} < 20) - تجنب الهطول الشديد`);
                continue;
            }
            
            // ========== الفلتر 4: RSI يجب أن يكون في منطقة ذهبية ==========
            // RSI بين 20 و 30 هو أفضل منطقة للدخول
            if (currentRSI > 30) {
                console.log(`⏸️ ${symbol}: فلتر RSI - ليس في منطقة ذهبية (${currentRSI.toFixed(2)} > 30)`);
                continue;
            }
            
            // ========== الشروط الأساسية للاستراتيجية ==========
            const priceExtended = currentPrice < currentSMA20 * 0.98; // السعر أقل من SMA20 بـ 2%
            const oversold = currentRSI < 30; // منطقة تشبع بيعي
            const volumeConfirm = checkVolumeConfirmation(volumes, volumes.length - 1, 5); // تأكيد الحجم
            
            if (!priceExtended) {
                console.log(`⏸️ ${symbol}: السعر ليس ممتداً بما يكفي (${((currentPrice - currentSMA20) / currentSMA20 * 100).toFixed(2)}% عن SMA20)`);
                continue;
            }
            
            if (!oversold) {
                console.log(`⏸️ ${symbol}: ليس في منطقة تشبع بيعي (RSI: ${currentRSI.toFixed(2)})`);
                continue;
            }
            
            if (!volumeConfirm) {
                console.log(`⏸️ ${symbol}: حجم التداول ضعيف`);
                continue;
            }
            
            // ========== فلتر إضافي: الانحراف المعياري (Bollinger Bands) ==========
            const stdDev = calculateStdDev(prices.slice(-20), currentSMA20, 20);
            const lowerBand = currentSMA20 - (2 * stdDev);
            
            // شرط إضافي: السعر يجب أن يكون قريباً من النطاق السفلي لـ Bollinger
            if (currentPrice > lowerBand * 1.02) {
                console.log(`⏸️ ${symbol}: السعر ليس قريباً من Bollinger Lower Band (السعر ${currentPrice.toFixed(2)} > النطاق السفلي ${lowerBand.toFixed(2)})`);
                continue;
            }
            
            // ========== فتح الصفقة ==========
            const stopLoss = currentPrice * 0.99; // وقف الخسارة 1%
            const takeProfit = currentSMA20; // الهدف: العودة إلى SMA20
            const potentialProfit = ((takeProfit - currentPrice) / currentPrice) * 100;
            
            console.log(`✅✅✅ فرصة تداول على ${symbol}:`);
            console.log(`   السعر: $${currentPrice.toFixed(4)}`);
            console.log(`   SMA20: $${currentSMA20.toFixed(4)}`);
            console.log(`   RSI: ${currentRSI.toFixed(2)}`);
            console.log(`   الربح المتوقع: ${potentialProfit.toFixed(2)}%`);
            console.log(`   الحجم: ${volumes[volumes.length - 1].toFixed(2)} (متوسط: ${volumes.slice(-5, -1).reduce((a,b)=>a+b,0)/4})`);
            
            await openNewTradeMeanReversion(user, symbol, currentPrice, stopLoss, takeProfit, exchange);
            return true;
            
        } catch (error) {
            console.log(`⚠️ خطأ في فحص ${symbol}:`, error.message);
        }
    }
    return false;
}

async function executeTrading() {
    try {
        const users = await User.find({ isRunning: true });
        console.log(`🔄 جاري تشغيل نظام التداول... (${users.length} مستخدم نشط)`);
        
        for (const user of users) {
            try {
                const exchange = await getExchangeConnection(user);
                if (user.currentTrade?.status === 'open') {
                    console.log(`👀 متابعة صفقة مفتوحة للمستخدم ${user.telegramId}: ${user.currentTrade.symbol}`);
                    await handleOpenTradeMeanReversion(user, exchange);
                } else {
                    console.log(`🔍 البحث عن فرص تداول للمستخدم ${user.telegramId}...`);
                    await findNewTradeOpportunity(user, exchange);
                }
            } catch (userError) {
                console.error(`❌ خطأ للمستخدم ${user.telegramId}:`, userError.message);
            }
        }
    } catch (error) {
        console.error('❌ خطأ في نظام التداول:', error);
    }
}

// تشغيل نظام التداول كل 30 ثانية
setInterval(executeTrading, 30 * 1000);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.json({ status: 'alive', mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date().toISOString(), version: '6.1.0' }));

function startKeepAlive() {
    const https = require('https');
    const url = config.WEBAPP_URL;
    setInterval(() => { 
        https.get(url, () => {}).on('error', () => {});
        setTimeout(() => https.get(`${url}/health`, () => {}).on('error', () => {}), 1000);
    }, 5 * 60 * 1000);
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Bot: https://t.me/${config.BOT_USERNAME}`);
    console.log(`🎯 Trading Bot Active with Enhanced Filters`);
    console.log(`📊 Filters: Trend Filter | Confirmation Filter | RSI Range | Volume Filter | Bollinger Bands`);
    startKeepAlive();
});

process.on('SIGINT', () => { 
    console.log('🛑 Shutting down...'); 
    bot.stopPolling(); 
    mongoose.connection.close(); 
    process.exit();
});