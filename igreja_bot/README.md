# Projeto Bot de Versículos + Doação para Igreja (WhatsApp)

Fluxo:

**Anúncio (Meta/Instagram) → WhatsApp Bot → conteúdo diário → opção de doação via Pix (PushinPay)**

## O que já está implementado

- Webhook do **WhatsApp Cloud API**:
  - Verificação `GET /webhooks/whatsapp`
  - Recebimento de mensagens `POST /webhooks/whatsapp`
- Menu por texto com opções:
  - `1` Versículo do dia
  - `2` Bênção
  - `3` Ajudar a igreja
- Cadastro automático de inscritos para disparo diário.
- Envio diário automático de versículo no horário configurado (`DAILY_HOUR`).
- Fluxo de doação com valores **R$ 2, R$ 5, R$ 10 e R$ 50**.
- Integração com PushinPay para gerar cobrança Pix e confirmar pagamento via webhook.

## Configuração

1. Instale dependências:

```bash
pip install -r igreja_bot/requirements.txt
```

2. Copie o arquivo de ambiente:

```bash
cp igreja_bot/.env.example .env
```

3. Configure no `.env`:

- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `PUSHINPAY_TOKEN`
- `CHURCH_PIX_KEY`
- `BASE_URL`

4. Rode a API:

```bash
uvicorn igreja_bot.src.main:app --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /webhooks/whatsapp` → valida webhook no Meta.
- `POST /webhooks/whatsapp` → recebe mensagens dos usuários.
- `POST /webhooks/pushinpay` → confirma pagamentos.

## Configuração no Meta (WhatsApp Cloud API)

No app do Meta Developers:

- Configure o callback URL: `https://SEU_DOMINIO/webhooks/whatsapp`
- Configure verify token igual ao `WHATSAPP_VERIFY_TOKEN`
- Assine evento de mensagens do WhatsApp.

## Importante (compliance)

- Anuncie como conteúdo devocional gratuito (“Receba versículos diários no WhatsApp”).
- Doação deve ser opcional.
- Evite promessas enganosas no anúncio.

## Segurança

Não versione tokens reais. Se algum token foi exposto, gere um novo imediatamente.
