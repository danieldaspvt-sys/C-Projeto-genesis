const axios = require('axios');

async function createPixCharge({ amount, chatId, baseUrl, token }) {
  if (!token) {
    throw new Error('PUSHINPAY_TOKEN não configurado');
  }

  const externalReference = `wweb:${chatId}:${amount}:${Date.now()}`;
  const payload = {
    amount,
    description: `Doação Igreja - R$ ${amount}`,
    external_reference: externalReference,
    webhook_url: `${baseUrl}/webhook/pushinpay`,
  };

  const response = await axios.post('https://api.pushinpay.com.br/v1/pix', payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
  });

  return {
    externalReference,
    pixCode: response.data?.pix_code || 'não retornado',
    paymentUrl: response.data?.payment_url || response.data?.qr_code_url || '',
    raw: response.data,
  };
}

module.exports = { createPixCharge };
