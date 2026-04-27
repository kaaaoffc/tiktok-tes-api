const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TOKEN = "8292577457:AAEEfD5trwzneRxHAms6O9niT_JntJ1DZA4";
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== DATABASE SEMENTARA =====
let userCache = {};
let cooldown = {};

// ===== START =====
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
`👋 Halo ${msg.from.first_name}

🔍 Perintah:
/tiktok <kata kunci>

Contoh:
/tiktok sewates konco`
    );
});

// ===== COOLDOWN =====
function isCooldown(userId) {
    const now = Date.now();
    if (cooldown[userId] && now - cooldown[userId] < 5000) {
        return true;
    }
    cooldown[userId] = now;
    return false;
}

// ===== SEARCH =====
bot.onText(/\/tiktok (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const query = match[1];

    if (isCooldown(userId)) {
        return bot.sendMessage(chatId, "⏳ Tunggu 5 detik...");
    }

    bot.sendMessage(chatId, "🔎 Searching...");

    try {
        const url = `https://api-kaaaoffc.vercel.app/search/tiktok?q=${encodeURIComponent(query)}`;
        const res = await axios.get(url);

        if (!res.data.status || !res.data.result.length) {
            return bot.sendMessage(chatId, "❌ Tidak ditemukan.");
        }

        userCache[userId] = {
            results: res.data.result,
            index: 0
        };

        sendResult(chatId, userId);

    } catch (err) {
        console.error(err);
        bot.sendMessage(chatId, "❌ Error API.");
    }
});

// ===== SEND RESULT =====
async function sendResult(chatId, userId) {
    const data = userCache[userId];
    const video = data.results[data.index];

    const text = `
🎬 *${video.title}*

👤 ${video.author.fullname}
👁 ${video.stats.views}
❤️ ${video.stats.likes}
⏱ ${video.duration}
📍 ${video.region}

(${data.index + 1}/${data.results.length})
`;

    bot.sendPhoto(chatId, video.cover, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎥 Video", callback_data: `video_${userId}` },
                    { text: "🎧 Audio", callback_data: `audio_${userId}` }
                ],
                [
                    { text: "⬅️ Prev", callback_data: `prev_${userId}` },
                    { text: "➡️ Next", callback_data: `next_${userId}` }
                ]
            ]
        }
    });
}

// ===== DOWNLOAD FILE =====
async function download(url, filepath) {
    const res = await axios({
        url,
        method: "GET",
        responseType: "stream"
    });

    return new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filepath);
        res.data.pipe(stream);
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
}

// ===== BUTTON HANDLER =====
bot.on("callback_query", async (query) => {
    const data = query.data.split("_");
    const action = data[0];
    const userId = data[1];
    const chatId = query.message.chat.id;

    if (!userCache[userId]) return;

    const cache = userCache[userId];

    // NEXT
    if (action === "next") {
        cache.index = (cache.index + 1) % cache.results.length;
        return sendResult(chatId, userId);
    }

    // PREV
    if (action === "prev") {
        cache.index = (cache.index - 1 + cache.results.length) % cache.results.length;
        return sendResult(chatId, userId);
    }

    const video = cache.results[cache.index];

    // ===== SEND VIDEO =====
    if (action === "video") {
        bot.sendMessage(chatId, "📥 Mengirim video...");
        return bot.sendVideo(chatId, video.data, {
            caption: video.title
        });
    }

    // ===== SEND AUDIO =====
    if (action === "audio") {
        bot.sendMessage(chatId, "🎧 Mengirim audio...");

        try {
            const filePath = path.join(__dirname, `audio_${Date.now()}.mp3`);
            await download(video.music_info.url, filePath);

            await bot.sendAudio(chatId, filePath, {
                title: video.music_info.title,
                performer: video.music_info.author
            });

            fs.unlinkSync(filePath);
        } catch (err) {
            bot.sendMessage(chatId, "❌ Gagal ambil audio.");
        }
    }
});
