const tg = window.Telegram.WebApp;

async function saveApi(){

const apiKey=document.getElementById("apiKey").value;
const apiSecret=document.getElementById("apiSecret").value;

await fetch("/save-api",{

method:"POST",

headers:{

"Content-Type":"application/json"

},

body:JSON.stringify({

telegramId:tg.initDataUnsafe.user.id,

apiKey,

apiSecret

})

});

alert("تم حفظ API");

}