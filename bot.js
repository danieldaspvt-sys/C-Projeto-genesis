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
const PUSHINPAY_BASE_API = process.env.PUSHINPAY_BASE_API || 'https://api.pushinpay.com.br';
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
    '╔════════════════════╗',
    '✨ *MENU PRINCIPAL* ✨',
    '╚════════════════════╝',
    '',
    'Digite uma opção:',
    '1️⃣ Versículo do dia',
    '2️⃣ Receber bênção',
    '3️⃣ Pedido de oração',
    '4️⃣ Contribuir com a obra',
  ].join('\n');
}

function donationMenu() {
  return [
    '╔════════════════════╗',
    '💝 *CONTRIBUIÇÃO* 💝',
    '╚════════════════════╝',
    '',
    'Escolha um valor (um por linha):',
    '🔹 1) R$ 2',
    '🔹 2) R$ 5',
    '🔹 3) R$ 10',
    '🔹 4) R$ 50',
    '',
    'Responda com: *2*, *5*, *10* ou *50*',
  ].join('\n');
}

function donationResponseMessage({ amount, paymentUrl, pixCode }) {
  return [
    '✅ *Cobrança PIX gerada com sucesso!*',
    '',
    `💰 Valor: *R$ ${amount}*`,
    `🔑 PIX de backup: ${CHURCH_PIX_KEY}`,
    '',
    paymentUrl ? `🔗 Link para pagamento:\n${paymentUrl}` : '🔗 Link para pagamento não retornado.',
    '',
    '📋 PIX copia e cola:',
    pixCode,
    '',
    'Assim que o pagamento for confirmado, envio seu agradecimento aqui 🙏',
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
        baseApiUrl: PUSHINPAY_BASE_API,
      });

      await client.sendMessage(
        chatId,
        donationResponseMessage({ amount: text, paymentUrl: charge.paymentUrl, pixCode: charge.pixCode })
      );

      console.log('[Pagamento] Cobrança gerada:', {
        chatId,
        amount: text,
        endpoint: charge.endpoint,
        headerMode: charge.headerMode,
      });
    } catch (error) {
      const providerMessage = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error('Erro ao criar cobrança PushinPay:', providerMessage);

      await client.sendMessage(
        chatId,
        [
          '⚠️ Não consegui gerar o pagamento automático agora.',
          'Você pode contribuir manualmente no PIX abaixo e eu registro depois:',
          '',
          `🔑 Chave PIX: ${CHURCH_PIX_KEY}`,
          `💰 Valor escolhido: R$ ${text}`,
          '',
          'Depois me envie *menu* para continuar 🙏',
        ].join('\n')
      );
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
      `📖 *Versículo do dia*\n\n"${verse.text}"\n— ${verse.reference}\n\nQue Deus abençoe seu dia 🙏`
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

  if (text === '4' || text === 'doar' || text === 'doação' || text === 'contribuir') {
    userState.set(chatId, 'awaiting_donation_value');
    await client.sendMessage(chatId, donationMenu());
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
      await client.sendMessage(
        chatId,
        `✅ *Pagamento confirmado!*\nRecebemos sua contribuição de *R$ ${amount}*.\nMuito obrigado por ajudar a obra 🙏`
      );
    },
  });

  await client.initialize();
}

start().catch((error) => {
  console.error('Erro ao iniciar bot:', error);
  process.exit(1);
});
