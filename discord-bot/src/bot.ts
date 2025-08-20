import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const DRIVE_FILE_ID = process.env.DRIVE_FILE_ID;
const GOOGLE_CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

if (!TOKEN || !DRIVE_FILE_ID || !GOOGLE_CREDENTIALS_JSON) {
  console.error('Brakuje wymaganych zmiennych środowiskowych!');
  process.exit(1);
}

const GOOGLE_CREDENTIALS = JSON.parse(GOOGLE_CREDENTIALS_JSON);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const auth = new google.auth.JWT(
  GOOGLE_CREDENTIALS.client_email,
  undefined,
  GOOGLE_CREDENTIALS.private_key,
  ['https://www.googleapis.com/auth/drive']
);

const drive = google.drive({ version: 'v3', auth });

let nicki: Record<string, string> = {};

async function ensureDriveFile() {
  try {
    await drive.files.get({ fileId: DRIVE_FILE_ID });
  } catch (err: any) {
    if (err.code === 404) {
      // Plik nie istnieje, tworzymy nowy
      const fileMetadata = { name: 'nicki.json', mimeType: 'application/json' };
      const media = { mimeType: 'application/json', body: JSON.stringify({}) };
      const res = await drive.files.create({ requestBody: fileMetadata, media });
      console.log(`Utworzono nowy plik Google Drive: ${res.data.id}`);
    } else {
      console.error('Błąd podczas sprawdzania pliku Drive:', err);
    }
  }
}

async function loadNicki() {
  try {
    const res = await drive.files.get({ fileId: DRIVE_FILE_ID, alt: 'media' });
    nicki = JSON.parse(res.data.toString());
    console.log('Nicki wczytane z Google Drive.');
  } catch (err) {
    console.log('Nie udało się wczytać nicków z Google Drive, zakładam pusty obiekt.', err);
    nicki = {};
  }
}

async function saveNicki() {
  try {
    await drive.files.update({
      fileId: DRIVE_FILE_ID,
      media: { mimeType: 'application/json', body: JSON.stringify(nicki, null, 2) },
    });
    console.log('Nicki zapisane na Google Drive.');
  } catch (err) {
    console.error('Nie udało się zapisać nicków na Google Drive.', err);
  }
}

client.once('ready', async () => {
  console.log(`Bot zalogowany jako ${client.user?.tag}`);
  await ensureDriveFile();
  await loadNicki();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Admin z "!" - usuwa wykrzyknik i wiadomość, wysyła bez niego
  if (message.content.startsWith('!') && message.member?.permissions.has('ADMINISTRATOR')) {
    const text = message.content.slice(1);
    try {
      await message.channel.send(text);
      await message.delete();
    } catch (err) {
      console.error('Błąd podczas wysyłania wiadomości admina:', err);
    }
    return;
  }

  // Każda wiadomość zapisuje nick
  if (message.channel instanceof TextChannel) {
    nicki[message.author.id] = message.content;
    await saveNicki();
  }
});

// Komendy slash
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'nicki') {
    if (interaction.options.getSubcommand() === 'reset') {
      nicki = {};
      await saveNicki();
      await interaction.reply({ content: '✅ Wszystkie nicki zostały zresetowane.', ephemeral: true });
    }
  }
});

client.login(TOKEN);
