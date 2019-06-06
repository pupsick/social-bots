const TelegramBot = require('node-telegram-bot-api');

const axios = require('axios');

const token = '842717881:AAF7Vs5GfbW2qpGNB96xVhhnltb731B-Il8';

const bot = new TelegramBot(token, {polling: true});

var mysql = require('mysql');

const config = require('./config.json');

let production, local;

const commands = [
    '/mycards',
    '/addcard',
    '/deletecard'
];

function pluck(array, key) {
    return array.map(o => o[key]);

}
function handleDisconnectLocal() {
    local = mysql.createConnection(config.databaseLocal.config);
    local.connect(function onConnect(err) {
        if (err) {
            console.error('Ошибка подключения к базе данных. ' + err.toString());
            setTimeout(handleDisconnectLocal, 10000);
        }

    });
    local.on('error', function onError(err) {
        console.error('База сбросила соединение. ' + err.toString());
        handleDisconnectLocal();
    });

}

handleDisconnectLocal();
function handleDisconnectProd() {
    production = mysql.createConnection(config.databaseProduction.config);
    production.connect(function onConnect(err) {
        if (err) {
            console.error('Ошибка подключения к базе данных. ' + err.toString());
            setTimeout(handleDisconnectProd, 10000);
        }

    });
    production.on('error', function onError(err) {
        console.error('База сбросила соединение. ' + err.toString());
        handleDisconnectProd();
    });

}

handleDisconnectProd();

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    let text = msg.text;

    if (msg.reply_to_message) {
        console.debug(`Пользователь ${userId} ответил на сообщение ${msg.reply_to_message.text}`);
        return;
    }

    if (text.indexOf("@") > -1) {
        text = text.split("@")[0];
    }

    if (!/(N\d+)/.test(text) && !commands.includes(text)) {
        return;
    }

    console.debug(`Message from ${userId} with text ${text}`);
    if (text[0] === 'N') {
        getDataByIdDatabase(text, userId, chatId);
    } else {
        switch (text) {
            case "/mycards":
                showCardsByUserId(userId, chatId);
                break;
            case "/addcard":
                bot.sendMessage(chatId, 'Введите номер новой карты', {
                    reply_markup: JSON.stringify(
                        {
                            force_reply: true,
                        }
                    )
                })
                    .then(function (sended) {
                        let chatId = sended.chat.id;
                        let messageId = sended.message_id;
                        bot.onReplyToMessage(chatId, messageId, message => {
                            let card = message.text;
                            console.debug(`Пользователь ${userId} запрос на добавление карты ${card}`);
                            if (!/(N\d+)/.test(card)) {
                                console.debug(`Неверный формат ввода. Отклонено.`);
                                bot.sendMessage(chatId, "Вы ввели неверный формат карты ");
                            } else {
                                addUserCardToDb(card, userId, bot, chatId);
                            }
                        });
                    });
                break;
            case "/deletecard":
                showDeleteCardsByUserId(userId, chatId);
                break;
            default:
                bot.sendMessage(chatId, 'Недопустимая команда');
                break;
        }
    }
});

function getDataByIdDatabase(card, userId, chatId = null, opts = null) {
    console.debug(`Пробуем найти карту ${card}. Запрос от ${userId}`);
    let query = `SELECT * FROM ${config.databaseProduction.targetTable} WHERE ${config.databaseProduction.searchField} = '${card}'`;
    console.debug(`Посылаем запрос ${query}`);
    production.query(query, function (err, result, fields) {
        if (err) {
            console.error(`Ошибка запроса. ${err.toString()}`);
            if (chatId) {
                bot.sendMessage(chatId, "Произошла ошибка. Попробуйте еще раз. Код ошибки #1");
            } else {
                bot.editMessageText('Произошла ошибка. Попробуйте еще раз. Код ошибки #1', opts);
            }
            return;
        }
        if (result.length > 0) {
            console.debug(`Баллы пользователя ${userId} на карте ${card}: ${result[0][config.databaseProduction.showField]}`);
            if (chatId) {
                bot.sendMessage(chatId, "Баллы: " + result[0][config.databaseProduction.showField]);
            } else {
                bot.editMessageText("Баллы: " + result[0][config.databaseProduction.showField], opts);
            }
        } else {
            console.debug(`Карта ${card} не найдена в базе данных`);
            if (chatId) {
                bot.sendMessage(chatId, "Указанная карта не найдена в базе данных");
            } else {
                bot.editMessageText("Баллы: " + result[0][config.databaseProduction.showField], opts);
            }
        }
    });
}

function addUserCardToDb(card, userId, chatId) {
    console.debug(`Пробуем добавить карту ${card}  для пользователя ${userId}`);
    let query = `SELECT * FROM users_cards_telegram WHERE user_id=${userId} AND card_number='${card}'`;
    console.debug(`Отправка запроса ${query}`);
    local.query(query, function (err, result) {
        if (err) {
            console.error(`Не удалось отправить запрос. ${err.toString()}`);
            bot.sendMessage(chatId, `Произошла ошибка. Попробуйте еще раз. Код ошибки #2`);
            return false;
        }
        if (result.length > 0) {
            console.debug(`Карта уже привязана к данному пользователю`);
            bot.sendMessage(chatId, `Карта ${card} уже привязана ранее к Вашему аккаунту`);
            return;
        }
        query = `INSERT INTO users_cards_telegram (user_id, card_number) VALUES (${userId}, '${card}')`;
        console.debug(`Карта еще не привязана. Отправляем запрос ${query}.`);
        local.query(query, function (err, result) {
            if (err) {
                console.error(`Не удалось отправить запрос. ${err.toString()}`);
                bot.sendMessage(chatId, "Произошла ошибка. Попробуйте еще раз. Код ошибки #3");
                return false;
            }
            console.debug(`Успешно привязали карту к аккаунту ${userId}`);
            bot.sendMessage(chatId, `Карта ${card} успешно привязана к Вашему аккаунту!`);
        });
    });
}

function showCardsByUserId(userId, chatId) {
    let query = `SELECT card_number FROM users_cards_telegram WHERE user_id = ${userId}`;
    console.debug(`Пытаемся найти все карты пользователя ${userId}`);
    console.debug(`Посылаем запрос ${query}`);
    local.query(query, function (err, result, fields) {
        if (err) {
            console.error(`Ошибка запроса. ${err.toString()}`);
            bot.sendMessage(chatId, "Произошла ошибка. Попробуйте еще раз. Код ошибки #4");
            return;
        }
        if (result.length > 0) {
            result = pluck(result, "card_number");
            let cards = [];
            for (let key in result) {
                cards[cards.length] = [{
                    text: result[key],
                    callback_data: result[key]
                }]
            }
            let options = {
                reply_markup: JSON.stringify({
                    inline_keyboard: cards
                })
            };
            bot.sendMessage(chatId, "Выберите одну из карт для просмотра баланса", options);
            console.debug(`У пользователя ${userId} ${result.length} карт`);
        } else {
            console.debug(`У пользователя ${userId} нет ни одной карты.`);
            bot.sendMessage(chatId, "У Вас не привязано ни одной карты");
        }
    });
}

bot.on('callback_query', (msg) => {
    let message = msg.data;
    const opts = {
        chat_id: msg.message.chat.id,
        message_id: msg.message.message_id,
    };

    if (message[0] === 'd') {
        let card = message.split("_")[1];
        deleteCard(card, msg.from.id, opts);
    } else {
        getDataByIdDatabase(message, msg.from.id, null, opts);
    }
});

function showDeleteCardsByUserId(userId, chatId) {
    let query = `SELECT card_number FROM users_cards_telegram WHERE user_id = ${userId}`;
    console.debug(`Пытаемся найти все карты пользователя ${userId}`);
    console.debug(`Посылаем запрос ${query}`);
    local.query(query, function (err, result, fields) {
        if (err) {
            console.error(`Ошибка запроса. ${err.toString()}`);
            bot.sendMessage(chatId, "Произошла ошибка. Попробуйте еще раз. Код ошибки #5");
            return;
        }
        if (result.length > 0) {
            result = pluck(result, "card_number");
            let cards = [];
            for (let key in result) {
                cards[cards.length] = [{
                    text: result[key],
                    callback_data: "delete_" + result[key]
                }]
            }
            let options = {
                reply_markup: JSON.stringify({
                    inline_keyboard: cards
                })
            };
            bot.sendMessage(chatId, "Выберите одну из карт для удаления", options);
            console.debug(`У пользователя ${userId} ${result.length} карт`);
        } else {
            console.debug(`У пользователя ${userId} нет ни одной карты.`);
            bot.sendMessage(chatId, "У Вас не привязано ни одной карты");
        }
    });
}

function deleteCard(card, userId, opts) {
    let query = `DELETE FROM users_cards_telegram WHERE user_id = ${userId} AND card_number = '${card}'`;
    console.debug(`Пробуем удалить карту ${card} у пользователя ${userId}`);
    console.debug(`Посылаем запрос ${query}`);
    local.query(query, function (err, result, fields) {
        if (err) {
            console.error(`Ошибка запроса. ${err.toString()}`);
            bot.editMessageText("Произошла ошибка. Попробуйте еще раз. Код ошибки #6", opts);
            return;
        }
        bot.editMessageText('Карта успешно удалена', opts);
    });
}