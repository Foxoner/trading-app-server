const ws = require('ws');
const fs = require('fs');
const { Spot } = require('@binance/connector');
const TelegramApi = require('node-telegram-bot-api');


const apiKey = 'j4ACWnDMhLTK1hLDwNNIak1rKxVOS73TmbdWy9JLlukvKgRKxKpqsZehBtnkqnHD'
const apiSecret = 'JFiHtocO1v2oKwNMLl2D7zQHb51UFzTltkqGHTaveKaIZNGhZfdXcDuwwWmbQPMl'
const client = new Spot(apiKey, apiSecret)

let oldCoins = new Set()
let modernCoins = new Set()
let difCoins = new Set()

// Telegram connection

const token = '6088134057:AAHpW-lCRqNKOd-sQVO2psxFnoSiWuAvYmo';
const bot = new TelegramApi(token, {polling: true});
const chatId = 346449084;

const genareteCoinBtn = (coin) => {
	return [{text: `${coin}`, url: `https://www.binance.com/uk-UA/trade/${coin}_BUSD?theme=dark&type=spot`}]
}

const genareteCoinBtnList = (coinsList) => {
	const coinBtnList ={reply_markup: JSON.stringify({
		inline_keyboard: coinsList.map(coin => genareteCoinBtn(coin))
	})}
	return coinBtnList
}

const usersCollecting = (chatId) => {
	const users = JSON.parse(fs.readFileSync('users.json')).users
	if (!users.includes(chatId)) {
		users.push(chatId)
		fs.writeFileSync('users.json', JSON.stringify({users: users}))
	}
}

bot.on('message', async msg => {
	const text = msg.text;
	const chatId = msg.chat.id;

	usersCollecting(chatId)

	if (text === '/start') {
		await bot.sendSticker(chatId, 'CAACAgIAAxkBAAIBM2P2oghAy5pXwwE6JHY4kMRkjdIcAAIGAAPANk8Tx8qi9LJucHYuBA')
		return bot.sendMessage(chatId, `Welcome to our chat with perspective coins!`)
		
	}
	return bot.sendMessage(chatId, `Sorry I don't know this command`)
})

//--------------------

// Main Logic

const megaScan = () => {
	// console.time('scan')
	client.ticker24hr().then(response => {
		const bd = JSON.parse(fs.readFileSync('config.json'))

		const firstArr = response.data;

		const objBTCBUSD = structuredClone(firstArr).filter(item => item.symbol.match(/^BTCBUSD$/))[0]

		console.log('BTC price:', objBTCBUSD.bidPrice, 'BTC %change:', objBTCBUSD.priceChangePercent)

		/* FIAT POOLS */	

		const allBUSDPairs = structuredClone(firstArr).filter(item => item.symbol.match(/BUSD$/) && item.count != 0 && Number(item.priceChangePercent) < bd.coinchange && Number(item.bidPrice) > 0).map(item => {
			item.symbol = item.symbol.replace(/BUSD/gi, '')
			return item
		})

		const allUSDTPairs = structuredClone(firstArr).filter(item => item.symbol.match(/USDT$/) && item.count != 0 && Number(item.priceChangePercent) < bd.coinchange && Number(item.bidPrice) > 0).map(item => {
			item.symbol = item.symbol.replace(/USDT/gi, '')
			return item
		})
		
		const allFiatPairs = allUSDTPairs.concat(allBUSDPairs)

		const tmpHeap = [];

		function itemCheck(item) {
			if (tmpHeap.indexOf(item.symbol) === -1) {
				tmpHeap.push(item.symbol);
				return true
			}
			return false;
		}

		const unicFiatPairs = allFiatPairs.filter(item => itemCheck(item))

		/* MAIN POOLS */

		function byField(field) {
		  return (a, b) => Number(a[field]) > Number(b[field]) ? 1 : -1;
		}

		const unicSortFiatPairs = unicFiatPairs.sort(byField('priceChangePercent'))

		return {data:{coins: unicSortFiatPairs, btc: objBTCBUSD}, bd: bd}
	})
    .then((obj) => {
		oldCoins = new Set(JSON.parse(fs.readFileSync('config.json')).data.coins.map(item => item.symbol))
        fs.writeFileSync('config.json', JSON.stringify({...obj.bd, data: obj.data}))
		modernCoins = new Set(JSON.parse(fs.readFileSync('config.json')).data.coins.map(item => item.symbol))
		difCoins = new Set([...modernCoins].filter(coin => !oldCoins.has(coin)));

    } )
}

// -----------

setInterval(async () => {
	try {
		await megaScan()
		const users = JSON.parse(fs.readFileSync('users.json')).users
		console.log(difCoins)
		Array.from(difCoins).length && users.length && users.forEach(user => {
			bot.sendMessage(user, `Here is some new coins ${String.fromCodePoint(128181)}`, genareteCoinBtnList(Array.from(difCoins)))
		})
	} catch (error) {
		console.log(error)
		await megaScan()
	}
}, 8000)


// WS Connection

const wss = new ws.Server({
  port: 8000
}, () => console.log('Server started on port 8000'))

wss.on('connection', function connection(ws) {
	
	setInterval(() => broadcastMessage(),10000)

	ws.on('message', (newPercent) => {
		const myBD = JSON.parse(fs.readFileSync('config.json'));
		newPercent = JSON.parse(newPercent);
		fs.writeFileSync('config.json', JSON.stringify({...myBD, coinchange: newPercent}))
		broadcastMessage()
	})
})

const broadcastMessage = () => {
	const newBD = JSON.parse(fs.readFileSync('config.json'))
	wss.clients.forEach(client => {
		client.send(JSON.stringify(newBD))
	})
}

