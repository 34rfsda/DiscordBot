import { Client, GatewayIntentBits, TextChannel, DMChannel, PartialDMChannel } from 'discord.js';
import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TOKEN = process.env.DISCORD_BOT_TOKEN!;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS!); // <-- uwzględnia Render variable

// Google Drive setup
const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// ID pliku w Google Drive do przechowywania nicków
const FILE_ID = 'TU_WKLEJ_ID_PLIKU_Z_DRIVE';

let nicki: Record<string, string> = {};

async function loadNicki() {
    try {
        const res = await drive.files.get({ fileId: FILE_ID, alt: 'media' });
        nicki = JSON.parse(res.data as string);
    } catch (e) {
        console.error('Nie udało się wczytać nicków z Google Drive, zakładam pusty obiekt.', e);
        nicki = {};
    }
}

async function saveNicki() {
    try {
        await drive.files.update({
            fileId: FILE_ID,
            media: { mimeType: 'application/json', body: JSON.stringify(nicki, null, 2) },
        });
    } catch (e) {
        console.error('Wystąpił błąd podczas zapisu nicków:', e);
    }
}

client.on('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user!.tag}`);
    await loadNicki();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Komenda reset nicków
    if (message.content === './nicki reset') {
        if (!message.member?.permissions.has('Administrator')) return;
        nicki = {};
        await saveNicki();
        await message.channel.send('✅ Wszystkie nicki zostały zresetowane.');
        return;
    }

    // Wiadomości admina z ! – usuwamy wykrzyknik i zapisujemy PV
    if (message.content.startsWith('!') && message.member?.permissions.has('Administrator')) {
        const content = message.content.slice(1); // usuń wykrzyknik
        try {
            await message.author.send(content);
            await message.delete();
        } catch (e) {
            console.error('Błąd wysyłania wiadomości admina do DM:', e);
        }
        return;
    }

    // Obsługa nicków – przyklad
    if (message.channel.isTextBased() && message.content.length <= 32) {
        nicki[message.author.id] = message.content;
        await saveNicki();
    }
});

client.login(TOKEN);
