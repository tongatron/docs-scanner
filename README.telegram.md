# Telegram Integration Notes

## Scelta implementata

Questa app usa la condivisione file nativa del browser:

- genera un `File` PDF nel browser;
- apre `navigator.share(...)`;
- l'utente sceglie Telegram se disponibile nel sistema.

Questa strada e corretta per una PWA client-side perché non espone credenziali sensibili.

## Perche non uso direttamente Bot API dal frontend

Il metodo `sendDocument` del Bot API richiede un token bot. Mettere quel token in JavaScript client-side significherebbe esporlo a chiunque apra l'app.

Quindi:

- frontend browser: bene per `navigator.share()`;
- backend o serverless: necessario per `sendDocument`.

## Se vuoi invio automatico a una chat Telegram

Serve un endpoint backend, ad esempio:

- `POST /api/telegram/send-document`

Input suggerito:

```json
{
  "filename": "documento.pdf",
  "chatId": "123456789"
}
```

Il backend deve:

1. ricevere il file PDF dal frontend;
2. leggere `TELEGRAM_BOT_TOKEN` da ambiente sicuro;
3. chiamare `https://api.telegram.org/bot<TOKEN>/sendDocument`;
4. restituire esito al frontend.

## Architettura consigliata

- frontend PWA: scansione, review, PDF
- backend/serverless: upload PDF verso Telegram Bot API

## Sicurezza minima

- non salvare token bot nel repository;
- non passare token nel client;
- limita `chatId` consentiti se il flusso e dedicato a una sola chat o gruppo;
- aggiungi rate limiting lato backend.
