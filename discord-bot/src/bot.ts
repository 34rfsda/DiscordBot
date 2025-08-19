import 'dotenv/config';
import { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, InteractionType, Message } from 'discord.js';
import { google } from 'googleapis';
import * as path from 'path';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let nickChannelId: string | null = null;
const DRIVE_FILE_ID = '1b_WTgKz7iEaj3qgU1NX9HpcjXvyQWRTt';

// Google Drive setup
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'nicki-469405-bc070fe88234.json'),
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Wczytaj nicki z Drive
async function loadNicki(): Promise<Set<string>> {
    try {
        const res = await drive.files.get({
            fileId: DRIVE_FILE_ID,
            alt: 'media',
        }, { responseType: 'stream' });

        let content = '';
        await new Promise<void>((resolve, reject) => {
            res.data.on('data', (chunk: Buffer) => content += chunk.toString());
            res.data.on('end', () => resolve());
            res.data.on('error', err => reject(err));
        });

        const lines = content.split('\n').map(l => l.replace(/^- /, '').trim()).filter(l => l.length > 0);
        return new Set(lines);
    } catch (err: any) {
        console.error('Błąd wczytywania nicków z Drive:', err);
        return new Set();
    }
}

// Zapis nicków do Drive
async function saveNicki(nicki: Set<string>) {
    const content = [...nicki].map(n => `- ${n}`).join('\n');
    await drive.files.update({
        fileId: DRIVE_FILE_ID,
        media: {
            mimeType: 'text/plain',
            body: content,
        },
    });
}

// Walidacja nicku
function isValidNick(nick: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(nick);
}

// Rejestracja komend
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
                {
                    name: 'nicki-reset',
                    description: 'Resetuje wszystkie zapisane nicki (tylko admin)',
                }
            ],
        }
    );
});

// Obsługa komend
client.on('interactionCreate', async (interaction) => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    const ephemeralFlag = 64;
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'Nie masz uprawnień do tej komendy.', flags: ephemeralFlag });
        return;
    }

    if (interaction.commandName === 'nicki-tutaj') {
        nickChannelId = interaction.channelId;
        await interaction.reply({ content: 'Ten kanał został ustawiony jako kanał do wpisywania nicków.', flags: ephemeralFlag });
    }

    if (interaction.commandName === 'nicki-reset') {
        try {
            await saveNicki(new Set());
            await interaction.reply({ content: 'Wszystkie nicki zostały zresetowane!', flags: ephemeralFlag });
        } catch (err: any) {
            console.error('Błąd resetu nicków:', err);
            await interaction.reply({ content: `Wystąpił błąd podczas resetu: ${err?.message || err}`, flags: ephemeralFlag });
        }
    }
});

// Obsługa wiadomości
client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!nickChannelId) return;
    if (message.channel.id !== nickChannelId) return;

    const nicki = await loadNicki();

    // Wiadomości zaczynające się od '!' od admina
    if (message.content.startsWith('!') && message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const newContent = message.content.slice(1); // usuń tylko '!'
        await message.edit({ content: newContent });
        return;
    }

    // Sprawdzenie, czy user już wysłał nick
    if (nicki.has(message.author.id)) {
        await message.delete();
        await message.author.send('Możesz wpisać swój nick tylko raz.');
        return;
    }

    // Walidacja nicku
    if (!isValidNick(message.content)) {
        await message.delete();
        await message.author.send('Twój nick jest niepoprawny! Używaj tylko liter i cyfr, bez spacji, myślników, kropek itp.');
        return;
    }

    // Dodaj nick do Google Drive
    try {
        nicki.add(message.author.id);
        await saveNicki(nicki);
        await message.author.send(`Twój nick "${message.content}" został dodany!`);
    } catch (err: any) {
        console.error('Błąd podczas zapisu nicku:', err);
        await message.author.send(`Wystąpił błąd podczas zapisu nicku: ${err?.message || err}`);
    }

    await message.delete();
});

client.login(process.env.DISCORD_BOT_TOKEN);
