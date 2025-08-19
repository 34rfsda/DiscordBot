"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const googleapis_1 = require("googleapis");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        discord_js_1.GatewayIntentBits.GuildMessages,
        discord_js_1.GatewayIntentBits.MessageContent
    ]
});
let nickChannelId = null;
const DRIVE_FILE_ID = '1b_WTgKz7iEaj3qgU1NX9HpcjXvyQWRTt';
const SUBMITTED_FILE = path.join(__dirname, 'submittedUsers.json');
// Wczytaj zapisane dane lub stwórz pusty set
let submittedUsers = new Set();
if (fs.existsSync(SUBMITTED_FILE)) {
    const data = fs.readFileSync(SUBMITTED_FILE, 'utf-8');
    submittedUsers = new Set(JSON.parse(data));
}
// Walidacja nicku: tylko litery i cyfry
function isValidNick(nick) {
    return /^[a-zA-Z0-9]+$/.test(nick);
}
// Google Drive setup
const auth = new googleapis_1.google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../nicki-469405-bc070fe88234.json'),
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = googleapis_1.google.drive({ version: 'v3', auth });
async function appendNickToDrive(nick) {
    const res = await drive.files.get({
        fileId: DRIVE_FILE_ID,
        alt: 'media',
    }, { responseType: 'stream' });
    let content = '';
    await new Promise((resolve, reject) => {
        res.data.on('data', (chunk) => content += chunk.toString());
        res.data.on('end', () => resolve());
        res.data.on('error', (err) => reject(err));
    });
    content += `- ${nick}\n`;
    await drive.files.update({
        fileId: DRIVE_FILE_ID,
        media: {
            mimeType: 'text/plain',
            body: content,
        },
    });
}
// Funkcja zapisująca Set do pliku
function saveSubmittedUsers() {
    fs.writeFileSync(SUBMITTED_FILE, JSON.stringify([...submittedUsers]), 'utf-8');
}
// Rejestracja komendy slash
client.on('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user?.tag}`);
    const rest = new discord_js_1.REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    await rest.put(discord_js_1.Routes.applicationCommands(client.user.id), {
        body: [
            {
                name: 'nicki-tutaj',
                description: 'Ustaw ten kanał jako kanał do wpisywania nicków',
            },
        ],
    });
});
client.on('interactionCreate', async (interaction) => {
    if (interaction.type !== discord_js_1.InteractionType.ApplicationCommand)
        return;
    if (interaction.commandName === 'nicki-tutaj') {
        const ephemeralFlag = 64;
        if (interaction.memberPermissions?.has(discord_js_1.PermissionsBitField.Flags.Administrator)) {
            nickChannelId = interaction.channelId;
            await interaction.reply({ content: 'Ten kanał został ustawiony jako kanał do wpisywania nicków.', flags: ephemeralFlag });
        }
        else {
            await interaction.reply({ content: 'Nie masz uprawnień do tej komendy.', flags: ephemeralFlag });
        }
    }
});
client.on('messageCreate', async (message) => {
    if (message.author.bot)
        return;
    if (!nickChannelId)
        return;
    if (message.channel.id !== nickChannelId)
        return;
    // Obsługa wiadomości zaczynających się od '!'
    if (message.content.startsWith('!')) {
        const newContent = message.content.slice(1);
        await message.author.send({ content: 'tekst' });
        await message.delete();
        return;
    }
    // Sprawdzenie, czy user już wysłał nick
    if (submittedUsers.has(message.author.id)) {
        await message.delete();
        await message.author.send('Możesz wpisać swój nick tylko raz.');
        return;
    }
    // Walidacja nicku
    if (!isValidNick(message.content)) {
        await message.author.send('Twój nick jest niepoprawny! Używaj tylko liter i cyfr, bez spacji, myślników, kropek itp.');
        await message.delete();
        return;
    }
    // Dodaj nick do Google Drive
    try {
        await appendNickToDrive(message.content);
        submittedUsers.add(message.author.id);
        saveSubmittedUsers(); // zapisujemy do pliku, żeby pamiętać po restarcie
        await message.author.send(`Twój nick "${message.content}" został dodany!`);
    }
    catch (err) {
        console.error('Błąd podczas zapisu nicku:', err);
        await message.author.send(`Wystąpił błąd podczas zapisu nicku: ${err?.message || err}`);
    }
    await message.delete();
});
client.login(process.env.DISCORD_BOT_TOKEN);
