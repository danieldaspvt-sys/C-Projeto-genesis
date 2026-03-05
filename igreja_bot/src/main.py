import asyncio
import json
import logging
import os
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("igreja_bot")

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
PUSHINPAY_TOKEN = os.getenv("PUSHINPAY_TOKEN", "")
PIX_KEY = os.getenv("CHURCH_PIX_KEY", "sua-chave-pix-aqui")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
DAILY_HOUR = int(os.getenv("DAILY_HOUR", "8"))
BIBLE_FILE = Path(os.getenv("BIBLE_FILE", "biblia-master/json/nvi.json"))
SUBSCRIBERS_FILE = Path(os.getenv("SUBSCRIBERS_FILE", "igreja_bot/subscribers.json"))
STATE_FILE = Path(os.getenv("STATE_FILE", "igreja_bot/user_state.json"))

app = FastAPI(title="Igreja Bot WhatsApp")


@dataclass
class Verse:
    text: str
    reference: str


def load_subscribers() -> set[str]:
    if not SUBSCRIBERS_FILE.exists():
        return set()
    return set(json.loads(SUBSCRIBERS_FILE.read_text(encoding="utf-8")))


def save_subscribers(phone_numbers: set[str]) -> None:
    SUBSCRIBERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SUBSCRIBERS_FILE.write_text(json.dumps(sorted(phone_numbers)), encoding="utf-8")


def load_user_state() -> dict[str, str]:
    if not STATE_FILE.exists():
        return {}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_user_state(state: dict[str, str]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state), encoding="utf-8")


def random_verse() -> Verse:
    with BIBLE_FILE.open(encoding="utf-8-sig") as f:
        books = json.load(f)

    book = random.choice(books)
    chapter_index = random.randrange(len(book["chapters"]))
    chapter = book["chapters"][chapter_index]
    verse_index = random.randrange(len(chapter))
    return Verse(text=chapter[verse_index], reference=f"{book['name']} {chapter_index + 1}:{verse_index + 1}")


async def wa_send_text(phone_number: str, text: str) -> None:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        raise HTTPException(status_code=500, detail="Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID")

    url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(url, json=payload, headers=headers)
    if response.status_code >= 300:
        logger.error("Erro WhatsApp API (%s): %s", response.status_code, response.text)


async def send_main_menu(phone_number: str) -> None:
    await wa_send_text(
        phone_number,
        "Escolha uma opção e responda com o número:\n"
        "1) 📖 Versículo do dia\n"
        "2) 🙏 Bênção\n"
        "3) ⛪ Ajudar a igreja",
    )


async def send_daily_verse(phone_number: str) -> None:
    verse = random_verse()
    await wa_send_text(
        phone_number,
        f"📖 Versículo do dia\n\n\"{verse.text}\"\n— {verse.reference}\n\nQue Deus abençoe seu dia 🙏",
    )


async def create_donation(phone_number: str, amount: int) -> None:
    if not PUSHINPAY_TOKEN:
        await wa_send_text(phone_number, "Gateway não configurado. Adicione PUSHINPAY_TOKEN no .env.")
        return

    payload = {
        "amount": amount,
        "description": f"Doação Igreja - R$ {amount}",
        "external_reference": f"whatsapp:{phone_number}:{amount}",
        "webhook_url": f"{BASE_URL}/webhooks/pushinpay",
    }
    headers = {"Authorization": f"Bearer {PUSHINPAY_TOKEN}"}

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post("https://api.pushinpay.com.br/v1/pix", json=payload, headers=headers)

    if response.status_code >= 300:
        logger.error("Falha PushinPay: %s", response.text)
        await wa_send_text(phone_number, "Erro ao gerar cobrança no momento.")
        return

    data = response.json()
    pix_code = data.get("pix_code", "não retornado")
    payment_url = data.get("payment_url") or data.get("qr_code_url") or "(link não retornado)"

    await wa_send_text(
        phone_number,
        f"🙏 Obrigado por escolher doar R$ {amount}.\n"
        f"Chave PIX de backup: {PIX_KEY}\n\n"
        f"Pague pelo link: {payment_url}\n\n"
        f"PIX copia e cola:\n{pix_code}",
    )


def parse_incoming_messages(payload: dict[str, Any]) -> list[tuple[str, str]]:
    messages: list[tuple[str, str]] = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for message in value.get("messages", []):
                phone_number = message.get("from")
                if not phone_number:
                    continue
                text = ""
                if message.get("type") == "text":
                    text = message.get("text", {}).get("body", "")
                elif message.get("type") == "button":
                    text = message.get("button", {}).get("text", "")
                messages.append((phone_number, text.strip().lower()))
    return messages


async def process_user_message(phone_number: str, text: str) -> None:
    subscribers = load_subscribers()
    subscribers.add(phone_number)
    save_subscribers(subscribers)

    if text in {"oi", "ola", "olá", "menu", "start", "/start"}:
        await wa_send_text(phone_number, "Seja bem-vindo! Você receberá versículos diariamente.")
        await send_main_menu(phone_number)
        return

    state = load_user_state()

    if state.get(phone_number) == "awaiting_donation_amount" and text in {"2", "5", "10", "50"}:
        await create_donation(phone_number, int(text))
        state.pop(phone_number, None)
        save_user_state(state)
        return

    if text in {"1", "versiculo", "versículo", "versiculo do dia", "versículo do dia"}:
        await send_daily_verse(phone_number)
    elif text in {"2", "bencao", "benção", "bencaos", "bênçãos"}:
        await wa_send_text(phone_number, "🙏 Que a paz de Cristo esteja com você hoje!")
    elif text in {"3", "doar", "ajudar", "ajudar igreja"}:
        state[phone_number] = "awaiting_donation_amount"
        save_user_state(state)
        await wa_send_text(
            phone_number,
            "Escolha o valor da doação respondendo com: 2, 5, 10 ou 50.",
        )
    else:
        await send_main_menu(phone_number)


@app.get("/webhooks/whatsapp")
async def verify_whatsapp_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == WHATSAPP_VERIFY_TOKEN:
        return JSONResponse(content=int(hub_challenge))
    raise HTTPException(status_code=403, detail="Token de verificação inválido")


@app.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    payload = await request.json()
    logger.info("Webhook WhatsApp recebido")

    for phone_number, text in parse_incoming_messages(payload):
        await process_user_message(phone_number, text)

    return JSONResponse({"ok": True})


@app.post("/webhooks/pushinpay")
async def pushinpay_webhook(request: Request):
    payload = await request.json()
    logger.info("Webhook PushinPay: %s", payload)

    reference = payload.get("external_reference", "")
    status = payload.get("status")
    if status == "paid" and reference.startswith("whatsapp:"):
        parts = reference.split(":")
        if len(parts) >= 3:
            phone_number = parts[1]
            amount = parts[2]
            await wa_send_text(phone_number, f"✅ Doação de R$ {amount} confirmada! Obrigado por ajudar a igreja.")

    return JSONResponse({"received": True})


async def daily_job() -> None:
    while True:
        await asyncio.sleep(60)
        current = datetime.now()
        if current.hour == DAILY_HOUR and current.minute == 0:
            for phone_number in load_subscribers():
                try:
                    await send_daily_verse(phone_number)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Falha enviando para %s: %s", phone_number, exc)


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(daily_job())
