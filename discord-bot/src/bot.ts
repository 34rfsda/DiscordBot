import 'dotenv/config';
import { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, InteractionType, Message } from 'discord.js';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let nickChannelId: string | null = null;
const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID!;
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

// Google Drive setup z ENV
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!),
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Funkcja dodająca nick do Drive
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
        media: { mimeType: 'text/plain', body: content },
    });
}

// Funkcja resetująca Drive (usuwa wszystkie nicki)
async function resetDriveFile() {
    await drive.files.update({
        fileId: DRIVE_FILE_ID,
        media: { mimeType: 'text/plain', body: '' },
    });
}

// Zapis Set do pliku
function saveSubmittedUsers() {
    fs.writeFileSync(SUBMITTED_FILE, JSON.stringify([...submittedUsers]), 'utf-8');
}

// Rejestracja komend slash
client.on('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user?.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
    await rest.put(
        Routes.applicationCommands(client.user!.id),
        {
            body: [
                {
                    name: 'nicki-tutaj',
                    description: 'Ustaw kanał do wpisywania nicków',
                },
                {
                    name: 'nicki-reset',
                    description: 'Resetuje wszystkie nicki (tylko admin)',
                },
            ],
        }
    );
});

// Obsługa komend
client.on('interactionCreate', async (interaction) => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    const ephemeralFlag = 64;

    if (interaction.commandName === 'nicki-tutaj') {
        if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            nickChannelId = interaction.channelId;
            await interaction.reply({ content: 'Ten kanał został ustawiony jako kanał do wpisywania nicków.', flags: ephemeralFlag });
        } else {
            await interaction.reply({ content: 'Nie masz uprawnień do tej komendy.', flags: ephemeralFlag });
        }
    }

    if (interaction.commandName === 'nicki-reset') {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: 'Nie masz uprawnień do tej komendy.', flags: ephemeralFlag });
            return;
        }
        try {
            await resetDriveFile();
            submittedUsers.clear();
            saveSubmittedUsers();
            await interaction.reply({ content: 'Wszystkie nicki zostały zresetowane!', flags: ephemeralFlag });
        } catch (err: any) {
            console.error(err);
            await interaction.reply({ content: `Błąd podczas resetu: ${err?.message || err}`, flags: ephemeralFlag });
        }
    }
});

// Obsługa wiadomości
client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;
    if (!nickChannelId) return;
    if (message.channel.id !== nickChannelId) return;

    // Obsługa wiadomości zaczynających się od '!'
    if (message.content.startsWith('!')) {
        const newContent = message.content.slice(1); // usuń !
        if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await message.edit({ content: newContent });
        } else {
            await message.author.send({ content: 'tekst' });
            await message.delete();
        }
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
        await message.author.send('Twój nick jest niepoprawny! Używaj tylko liter i cyfr, bez spacji ani znaków specjalnych.');
        await message.delete();
        return;
    }

    // Dodaj nick do Google Drive
    try {
        await appendNickToDrive(message.content);
        submittedUsers.add(message.author.id);
        saveSubmittedUsers();
        await message.author.send(`Twój nick "${message.content}" został dodany!`);
    } catch (err: any) {
        console.error('Błąd podczas zapisu nicku:', err);
        await message.author.send(`Wystąpił błąd podczas zapisu nicku: ${err?.message || err}`);
    }

    await message.delete();
});

client.login(process.env.DISCORD_BOT_TOKEN);
