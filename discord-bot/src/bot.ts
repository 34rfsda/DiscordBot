import { Client, GatewayIntentBits, Partials, REST, Routes, InteractionType, PermissionsBitField } from 'discord.js';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// ==== KONFIG ====
const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS!);
const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID!;

const FILE_PATH = path.join(__dirname, 'nicki.json');

// ==== GOOGLE DRIVE AUTH ====
const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// ==== DISCORD CLIENT ====
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
});

// ==== PAMIĘĆ NICKÓW ====
let submittedUsers = new Map<string, string>();
let nickChannelId: string | null = null;

// ==== FUNKCJE ====
function saveSubmittedUsers() {
    const obj = Object.fromEntries(submittedUsers);
    fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function loadSubmittedUsers() {
    if (fs.existsSync(FILE_PATH)) {
        const data = fs.readFileSync(FILE_PATH, 'utf8');
        submittedUsers = new Map(Object.entries(JSON.parse(data)));
    }
}

// ==== BOT READY ====
client.once('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user?.tag}`);

    loadSubmittedUsers();

    // Rejestracja komend
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user!.id), {
        body: [
            {
                name: 'nicki-tutaj',
                description: 'Ustaw ten kanał jako kanał do wpisywania nicków',
            },
            {
                name: 'nicki-reset',
                description: 'Resetuje wszystkie nicki i czyści plik w Google Drive',
            },
        ],
    });
});

// ==== OBSŁUGA KOMEND ====
client.on('interactionCreate', async (interaction) => {
    if (interaction.type !== InteractionType.ApplicationCommand) return;

    if (interaction.commandName === 'nicki-tutaj') {
        if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            nickChannelId = interaction.channelId;
            await interaction.reply({
                content: '✅ Ten kanał został ustawiony jako kanał do wpisywania nicków.',
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: '❌ Nie masz uprawnień do tej komendy.',
                ephemeral: true,
            });
        }
    }

    if (interaction.commandName === 'nicki-reset') {
        if (interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
            try {
                // wyczyść lokalną pamięć
                submittedUsers.clear();
                saveSubmittedUsers();

                // nadpisz plik w Google Drive pustą treścią
                await drive.files.update({
                    fileId: DRIVE_FILE_ID,
                    media: {
                        mimeType: 'text/plain',
                        body: '',
                    },
                });

                await interaction.reply({
                    content: '✅ Wszystkie nicki zostały zresetowane.',
                    ephemeral: true,
                });
            } catch (err: any) {
                console.error('Błąd podczas resetowania nicków:', err);
                await interaction.reply({
                    content: `❌ Wystąpił błąd: ${err?.message || err}`,
                    ephemeral: true,
                });
            }
        } else {
            await interaction.reply({
                content: '❌ Nie masz uprawnień do tej komendy.',
                ephemeral: true,
            });
        }
    }
});

// ==== OBSŁUGA WIADOMOŚCI ====
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Obsługa komendy admina z "!"
    if (message.member?.permissions.has(PermissionsBitField.Flags.Administrator) && message.content.startsWith('!')) {
        const text = message.content.slice(1).trim();
        await message.delete();
        if (text.length > 0) {
            await message.channel.send(text);
        }
        return;
    }

    // Obsługa wpisywania nicków
    if (nickChannelId && message.channel.id === nickChannelId) {
        if (submittedUsers.has(message.author.id)) {
            await message.delete();
            return;
        }

        const nick = message.content.trim();
        if (nick.length > 0) {
            submittedUsers.set(message.author.id, nick);
            saveSubmittedUsers();

            // Zapisz też do Google Drive
            await drive.files.update({
                fileId: DRIVE_FILE_ID,
                media: {
                    mimeType: 'application/json',
                    body: JSON.stringify(Object.fromEntries(submittedUsers)),
                },
            });

            await message.author.send(`✅ Twój nick "${nick}" został zapisany!`);
        }
        await message.delete();
    }
});

// ==== START ====
client.login(TOKEN);
