async function load(){

const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=50");

const data = await res.json();

const prices = data.map(c=>parseFloat(c[4]));

const ctx = document.getElementById("chart");

new Chart(ctx,{

type:"line",

data:{

labels:prices,

datasets:[{

label:"Price",

data:prices

}]

}

});

}

load();