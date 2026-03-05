const axios = require('axios');

function buildHeaders(token, mode = 'bearer') {
  if (mode === 'raw') {
    return {
      Authorization: token,
      'Content-Type': 'application/json',
    };
  }

  if (mode === 'api-key') {
    return {
      'x-api-key': token,
      'Content-Type': 'application/json',
    };
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function payloadVariants({ amount, externalReference, webhookUrl }) {
  return [
    {
      amount,
      description: `Doação Igreja - R$ ${amount}`,
      external_reference: externalReference,
      webhook_url: webhookUrl,
    },
    {
      amount: amount * 100,
      description: `Doação Igreja - R$ ${amount}`,
      external_reference: externalReference,
      webhook_url: webhookUrl,
    },
    {
      value: amount * 100,
      description: `Doação Igreja - R$ ${amount}`,
      external_reference: externalReference,
      webhook_url: webhookUrl,
    },
  ];
}

function endpointVariants(baseApiUrl) {
  const base = baseApiUrl.replace(/\/$/, '');
  return [`${base}/v1/pix`, `${base}/api/v1/pix/cashIn`];
}

async function tryCreateCharge({ token, endpoints, payloads }) {
  const headerModes = ['bearer', 'raw', 'api-key'];
  let lastError = null;

  for (const endpoint of endpoints) {
    for (const payload of payloads) {
      for (const headerMode of headerModes) {
        try {
          const response = await axios.post(endpoint, payload, {
            headers: buildHeaders(token, headerMode),
            timeout: 20000,
          });

          return { response, endpoint, headerMode, payload };
        } catch (error) {
          lastError = error;
        }
      }
    }
  }

  throw lastError;
}

async function createPixCharge({ amount, chatId, baseUrl, token, baseApiUrl }) {
  if (!token) {
    throw new Error('PUSHINPAY_TOKEN não configurado');
  }

  const externalReference = `wweb:${chatId}:${amount}:${Date.now()}`;
  const webhookUrl = `${baseUrl}/webhook/pushinpay`;
  const endpoints = endpointVariants(baseApiUrl || 'https://api.pushinpay.com.br');
  const payloads = payloadVariants({ amount, externalReference, webhookUrl });

  const { response, endpoint, headerMode, payload } = await tryCreateCharge({
    token,
    endpoints,
    payloads,
  });

  const data = response.data || {};

  return {
    externalReference,
    pixCode: data.pix_code || data.qr_code || data.emv || data.copy_paste || 'não retornado',
    paymentUrl: data.payment_url || data.qr_code_url || data.url || '',
    endpoint,
    headerMode,
    sentPayload: payload,
    raw: data,
  };
}

module.exports = { createPixCharge };
