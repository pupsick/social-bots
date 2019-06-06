const TelegramBot = require('node-telegram-bot-api');

const axios = require('axios');

const token = '842717881:AAF7Vs5GfbW2qpGNB96xVhhnltb731B-Il8';

const bot = new TelegramBot(token, {polling: true});

var mysql = require('mysql');

const config = require('./config.json');

let conn  = mysql.createConnection(config.database.config);

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    let text = msg.text;
    if (text.indexOf("@") > -1) {
        text = text.split("@")[0];
    }

    if (isNaN(text)) {
        return;
    }
    getDataByIdDatabase(text, bot, chatId);
    getDataByIdREST(text, bot, chatId);
});

function getDataByIdDatabase(id, bot, chatId) {
    conn.connect(function (err) {
        if (err) {
            bot.sendMessage(chatId, "Не удалось подключиться к базе данных");
            return;
        }
        conn.query(`SELECT * FROM ${config.database.targetTable} WHERE ${config.database.searchField} = ${id}`, function (err, result, fields) {
            if (err) {
                bot.sendMessage(chatId, "Не удалось выполнить запрос к базе данных");
                return;
            }
            if (result.length > 0) {
                bot.sendMessage(chatId, "Database: " + result[0].title);
            } else {
                bot.sendMessage(chatId, "Не найдено записей с данным ID");
            }
        });
    });
}

function getDataByIdREST(id, bot, chatId) {
    let url = config.REST.endpoint.replace("{data}", id);
    axios.get(url)
        .then(result => {
            bot.sendMessage(chatId, "REST: " + result.data.title);
        })
        .catch(error => {
            console.log("Failed at " + url + error.toString());
            bot.sendMessage(chatId, "Не удалось получить данные с помощью REST");
        })
}