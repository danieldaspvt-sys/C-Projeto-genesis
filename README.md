# Bot de WhatsApp local (Node.js) - Versículos + Doações

Projeto para rodar **localmente no Windows** sem Docker, usando **whatsapp-web.js** (WhatsApp Web), conexão por **QR Code** e sessão persistente.

## Estrutura

- `/bot.js`
- `/biblia.json`
- `/payments/pushinpay.js`
- `/webhook/webhook.js`
- `/.env` (crie a partir do `.env.example`)

## Requisitos

- Node.js 18+
- Google Chrome instalado
- Conta/configuração PushinPay

## Instalação

```bash
npm install
```

Crie seu `.env` com base no exemplo:

```bash
copy .env.example .env
```

(ou no PowerShell)

```powershell
Copy-Item .env.example .env
```

## Rodar o bot

```bash
node bot.js
```

ou

```bash
npm start
```

Na primeira execução, um **QR Code** aparece no terminal.
Abra o WhatsApp no celular e escaneie para conectar.

A sessão fica salva localmente (`.wwebjs_auth`), então não precisa escanear toda vez.

## Menu do bot (visual melhorado)

Quando o usuário enviar **"oi"** (ou "menu"), o bot mostra menu com layout caprichado:

1️⃣ Versículo do dia  
2️⃣ Receber bênção  
3️⃣ Pedido de oração  
4️⃣ Contribuir com a obra

Na opção de contribuição, os valores aparecem **um embaixo do outro**:

- R$ 2
- R$ 5
- R$ 10
- R$ 50

## Doações (PushinPay) - otimizado

O fluxo de pagamento foi melhorado para reduzir falhas:

- Suporte a múltiplos formatos de payload (`amount`/`value`, reais/centavos).
- Tentativa com diferentes formatos de autenticação (`Bearer`, `Authorization` puro, `x-api-key`).
- Tentativa em dois endpoints comuns da PushinPay.
- Fallback de mensagem com chave PIX manual quando API estiver indisponível.

### Variáveis importantes no `.env`

- `PUSHINPAY_TOKEN`
- `PUSHINPAY_BASE_API` (padrão: `https://api.pushinpay.com.br`)
- `CHURCH_PIX_KEY`
- `WEBHOOK_PORT`
- `BASE_URL` (para webhook público)

## Webhook de confirmação

O servidor webhook sobe junto com o bot em:

- `POST /webhook/pushinpay`

Quando a PushinPay enviar status de pago (`paid`, `approved`, `completed`, `success`), o bot envia mensagem de agradecimento no WhatsApp.

> Para receber webhook no PC local, use uma URL pública (ex.: ngrok) e configure `BASE_URL`.

## Observação

Versículos são carregados do arquivo `biblia.json` (JSON da Bíblia dentro do projeto).
