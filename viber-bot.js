const ViberBot = require('viber-bot').Bot;
const BotEvents = require('viber-bot').Events;

const bot = new ViberBot({
    authToken: YOUR_AUTH_TOKEN_HERE,
    name: "EchoBot",
    avatar: "http://viber.com/avatar.jpg" // It is recommended to be 720x720, and no more than 100kb.
});

const axios = require('axios');

var mysql = require('mysql');

const config = require('./config.json');

let conn  = mysql.createConnection(config.database.config);

bot.on(BotEvents.MESSAGE_RECEIVED, (message, response) => {
    if (isNaN(message)) {
        return;
    }
    getDataByIdDatabase(message, response);
    getDataByIdREST(message, response);
});


function getDataByIdDatabase(id, response) {
    conn.connect(function (err) {
        if (err) {
            response.send("Не удалось подключиться к базе данных");
            return;
        }
        conn.query(`SELECT * FROM ${config.database.targetTable} WHERE ${config.database.searchField} = ${id}`, function (err, result, fields) {
            if (err) {
                response.send("Не удалось выполнить запрос к базе данных");
                return;
            }
            if (result.length > 0) {
                response.send("Database: " + result[0].title);
            } else {
                response.send("Не найдено записей с данным ID");
            }
        });
    });
}

function getDataByIdREST(id, response) {
    let url = config.REST.endpoint.replace("{data}", id);
    axios.get(url)
        .then(result => {
            response.send("REST: " + result.data.title);
        })
        .catch(error => {
            console.log("Failed at " + url + error.toString());
            response.send("Не удалось получить данные с помощью REST");
        })
}