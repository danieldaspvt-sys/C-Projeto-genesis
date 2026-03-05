require('dotenv').config();

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createPixCharge } = require('./payments/pushinpay');
const { startWebhookServer } = require('./webhook/webhook');

const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${WEBHOOK_PORT}`;
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN || '';
const CHURCH_PIX_KEY = process.env.CHURCH_PIX_KEY || 'sua-chave-pix-aqui';
const BIBLE_FILE = process.env.BIBLE_FILE || path.join(__dirname, 'biblia.json');

const DONATION_VALUES = new Set(['2', '5', '10', '50']);
const userState = new Map();

function loadBible() {
  const raw = fs.readFileSync(BIBLE_FILE, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

const bible = loadBible();

function getRandomVerse() {
  const book = bible[Math.floor(Math.random() * bible.length)];
  const chapterIndex = Math.floor(Math.random() * book.chapters.length);
  const chapter = book.chapters[chapterIndex];
  const verseIndex = Math.floor(Math.random() * chapter.length);

  return {
    text: chapter[verseIndex],
    reference: `${book.name} ${chapterIndex + 1}:${verseIndex + 1}`,
  };
}

function mainMenu() {
  return [
    'Escolha uma opção e responda com o número:',
    '1️⃣ Versículo do dia',
    '2️⃣ Receber bênção',
    '3️⃣ Pedido de oração',
    '4️⃣ Contribuir com a obra',
  ].join('\n');
}

async function handleIncomingMessage(client, msg) {
  const chatId = msg.from;
  const text = (msg.body || '').trim().toLowerCase();

  if (text === 'oi' || text === 'olá' || text === 'ola' || text === 'menu' || text === '/start') {
    await client.sendMessage(chatId, 'Seja bem-vindo! 🙏');
    await client.sendMessage(chatId, mainMenu());
    return;
  }

  const state = userState.get(chatId);

  if (state === 'awaiting_donation_value' && DONATION_VALUES.has(text)) {
    try {
      const charge = await createPixCharge({
        amount: Number(text),
        chatId,
        baseUrl: BASE_URL,
        token: PUSHINPAY_TOKEN,
      });

      await client.sendMessage(
        chatId,
        [
          `🙏 Obrigado por contribuir com R$ ${text}.`,
          '',
          `Chave PIX (backup): ${CHURCH_PIX_KEY}`,
          '',
          charge.paymentUrl ? `Link de pagamento: ${charge.paymentUrl}` : 'Link de pagamento não retornado.',
          '',
          'PIX copia e cola:',
          charge.pixCode,
        ].join('\n')
      );
    } catch (error) {
      await client.sendMessage(chatId, 'Não consegui gerar o pagamento agora. Tente novamente em instantes.');
      console.error('Erro ao criar cobrança PushinPay:', error.message);
    }

    userState.delete(chatId);
    return;
  }

  if (state === 'awaiting_prayer') {
    await client.sendMessage(chatId, 'Recebi seu pedido de oração 🙏 Vamos orar por você.');
    userState.delete(chatId);
    return;
  }

  if (text === '1') {
    const verse = getRandomVerse();
    await client.sendMessage(
      chatId,
      `📖 Versículo do dia\n\n"${verse.text}"\n— ${verse.reference}\n\nQue Deus abençoe seu dia 🙏`
    );
    return;
  }

  if (text === '2') {
    await client.sendMessage(chatId, '🙏 Que o Senhor te conceda paz, força e direção hoje!');
    return;
  }

  if (text === '3') {
    userState.set(chatId, 'awaiting_prayer');
    await client.sendMessage(chatId, 'Envie seu pedido de oração. Vou registrar aqui com carinho.');
    return;
  }

  if (text === '4') {
    userState.set(chatId, 'awaiting_donation_value');
    await client.sendMessage(chatId, 'Escolha o valor da contribuição: R$2, R$5, R$10 ou R$50.\nResponda com: 2, 5, 10 ou 50.');
    return;
  }

  await client.sendMessage(chatId, mainMenu());
}

async function start() {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'igreja-bot' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('\nEscaneie o QR Code abaixo no WhatsApp:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('WhatsApp conectado com sucesso!');
  });

  client.on('authenticated', () => {
    console.log('Sessão autenticada e salva localmente.');
  });

  client.on('auth_failure', (message) => {
    console.error('Falha de autenticação:', message);
  });

  client.on('message', async (msg) => {
    try {
      await handleIncomingMessage(client, msg);
    } catch (error) {
      console.error('Erro ao processar mensagem:', error.message);
    }
  });

  startWebhookServer({
    port: WEBHOOK_PORT,
    onPaymentConfirmed: async ({ chatId, amount }) => {
      await client.sendMessage(chatId, `✅ Pagamento confirmado de R$ ${amount}. Muito obrigado por contribuir com a obra!`);
    },
  });

  await client.initialize();
}

start().catch((error) => {
  console.error('Erro ao iniciar bot:', error);
  process.exit(1);
});
