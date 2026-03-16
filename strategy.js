const ccxt = require("ccxt");
const ti = require("technicalindicators");

async function startTrading(user){

try{

const exchange = new ccxt.binance({

apiKey:user.apiKey,
secret:user.apiSecret,
enableRateLimit:true

});

const symbol = user.symbol || "BTC/USDT";

const candles = await exchange.fetchOHLCV(symbol,"5m",undefined,200);

const closes = candles.map(c=>c[4]);

const ema50 = ti.EMA.calculate({period:50,values:closes});
const ema200 = ti.EMA.calculate({period:200,values:closes});
const rsi = ti.RSI.calculate({period:14,values:closes});

const price = closes[closes.length-1];

const ema50last = ema50[ema50.length-1];
const ema200last = ema200[ema200.length-1];
const rsiLast = rsi[rsi.length-1];

console.log("price",price);

if(ema50last > ema200last && rsiLast < 65){

await exchange.createMarketBuyOrder(symbol,0.001);

console.log("BUY");

}

if(ema50last < ema200last && rsiLast > 40){

await exchange.createMarketSellOrder(symbol,0.001);

console.log("SELL");

}

}catch(e){

console.log("error",e.message);

}

}

module.exports = startTrading;