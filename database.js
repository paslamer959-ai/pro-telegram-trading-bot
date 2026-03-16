const mongoose = require("mongoose");
const { MONGO_URL } = require("./config");

mongoose.connect(MONGO_URL);

const User = mongoose.model("User",{

telegramId:Number,

apiKey:String,

apiSecret:String,

symbol:String,

active:Boolean,

profit:{type:Number,default:0},

trades:{type:Number,default:0}

});

module.exports = User;