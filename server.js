const express = require("express");
const bodyParser = require("body-parser");

const User = require("./database");
const startTrading = require("./strategy");

const app = express();

app.use(bodyParser.json());

app.use(express.static("web"));

app.post("/save-api",async(req,res)=>{

const {telegramId,apiKey,apiSecret} = req.body;

await User.findOneAndUpdate(

{telegramId},

{apiKey,apiSecret,active:true},

{upsert:true}

);

res.json({message:"API saved"});

});

setInterval(async()=>{

const users = await User.find({active:true});

for(const user of users){

startTrading(user);

}

},15000);

app.listen(process.env.PORT || 3000,()=>{

console.log("server running");

});