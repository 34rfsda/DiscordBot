import 'dotenv/config';
import { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, InteractionType, Message } from 'discord.js';
import { google } from 'googleapis';
import * as path from 'path';
import * as fs from 'fs';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let nickChannelId: string | null = null;
const DRIVE_FILE_ID = '1b_WTgKz7iEaj3qgU1NX9HpcjXvyQWRTt';
const SUBMITTED_FILE = path.join(__dirname, 'submittedUsers.json');

// Wczytaj zapisane dane lub stwórz pusty set
let submittedUsers = new Set<string>();
if (fs.existsSync(SUBMITTED_FILE)) {
    const data = fs.readFileSync(SUBMITTED_FILE, 'utf-8');
    submittedUsers = new Set(JSON.parse(data));
}

// Walidacja nicku: tylko litery i cyfry
function isValidNick(nick: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(nick);
}

// Google Drive setup
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../nicki-469405-bc070fe88234.json'),
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

async function appendNickToDrive(nick: string) {
    const res = await drive.files.get({
        fileId: DRIVE_FILE_ID,
        alt: 'media',
    }, { responseType: 'stream' });

    let content = '';
    await new Promise<void>((resolve, reject) => {
        res.data.on('data', (chunk: Buffer) => content += chunk.toString());
        res.data.on('end', () => resolve());
        res.data.on('error', (err: any) => reject(err));
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
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
    await rest.put(
        Routes.applicationCommands(client.user!.id),
        {
            body: [
                {
                    name: 'nicki-tutaj',
                    description: 'Ustaw ten kanał jako kanał do wpisywania nicków',
                },
            ],
        }
    );
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;
    if (interaction.commandName === 'nicki-tutaj') {
        const ephemeralFlag = 64;
        if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            nickChannelId = interaction.channelId;
            await interaction.reply({ content: 'Ten kanał został ustawiony jako kanał do wpisywania nicków.', flags: ephemeralFlag });
        } else {
            await interaction.reply({ content: 'Nie masz uprawnień do tej komendy.', flags: ephemeralFlag });
        }
    }
});

client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!nickChannelId) return;
    if (message.channel.id !== nickChannelId) return;

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
    } catch (err: any) {
        console.error('Błąd podczas zapisu nicku:', err);
        await message.author.send(`Wystąpił błąd podczas zapisu nicku: ${err?.message || err}`);
    }

    await message.delete();
});

client.login(process.env.DISCORD_BOT_TOKEN);