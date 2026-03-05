const express = require('express');

function parseReference(reference) {
  if (!reference || typeof reference !== 'string') return null;
  if (!reference.startsWith('wweb:')) return null;
  const parts = reference.split(':');
  if (parts.length < 4) return null;

  return {
    chatId: parts[1],
    amount: parts[2],
    timestamp: parts[3],
  };
}

function startWebhookServer({ port, onPaymentConfirmed }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/webhook/pushinpay', async (req, res) => {
    try {
      const payload = req.body || {};
      const status = payload.status;
      const parsed = parseReference(payload.external_reference);

      if (status === 'paid' && parsed) {
        await onPaymentConfirmed({
          chatId: parsed.chatId,
          amount: parsed.amount,
          payload,
        });
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Erro no webhook PushinPay:', error.message);
      res.status(500).json({ received: false });
    }
  });

  app.listen(port, () => {
    console.log(`Webhook rodando em http://localhost:${port}`);
  });
}

module.exports = { startWebhookServer };
