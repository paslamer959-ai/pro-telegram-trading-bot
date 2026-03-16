const TelegramBot = require("node-telegram-bot-api");

const { TOKEN , WEBAPP_URL } = require("./config");

const bot = new TelegramBot(TOKEN,{polling:true});

bot.onText(/\/start/,(msg)=>{

bot.sendMessage(msg.chat.id,

"🚀 منصة التداول الذكية",

{

reply_markup:{

inline_keyboard:[

[{

text:"📊 فتح المنصة",

web_app:{url:WEBAPP_URL}

}]

]

}

});

});