# Telegram Integration Notes

## Cosa fa questa versione

La PWA genera il PDF nel browser e prova a condividerlo tramite `navigator.share()`.

Questo permette di:

- aprire lo share sheet del dispositivo;
- scegliere Telegram se installato;
- evitare token bot esposti lato client.

## Cosa non fa

Questa versione non invia automaticamente il PDF a una chat Telegram tramite Bot API.

Per quello serve un backend o una function serverless.

## Se vuoi invio automatico via Bot API

Serve un endpoint backend, per esempio:

- `POST /api/telegram/send-document`

Il backend deve:

1. ricevere il PDF dal frontend;
2. leggere `TELEGRAM_BOT_TOKEN` da ambiente sicuro;
3. chiamare `sendDocument` del Bot API;
4. restituire esito al browser.

## Perche non farlo direttamente dal frontend

Perche il token bot non deve stare nel codice client-side.
