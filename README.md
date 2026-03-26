# Docs Scanner

PWA mobile-first per:

- fotografare documenti una pagina alla volta;
- applicare rendering bianco/nero ad alto contrasto;
- comporre un PDF multipagina;
- condividere il PDF su Telegram tramite share sheet nativo del dispositivo

L'app usa il **Scanbot Web SDK** in locale, senza CDN in produzione.

## Funzioni principali

- acquisizione guidata con **auto-capture**;
- **auto-crop** e raddrizzamento documento;
- filtro **ScanbotBinarizationFilter** in uscita;
- review multi-pagina dentro la UI Scanbot;
- persistenza della bozza documento in storage browser;
- generazione PDF A4;
- condivisione file via `navigator.share()` quando supportata;
- fallback download PDF se il browser non supporta la condivisione file.

## Stack

- `scanbot-web-sdk` `8.0.1`
- `vite`
- PWA shell con `manifest.webmanifest` e `service worker` minimale

## Requisiti

- Node.js recente
- browser mobile moderno
- HTTPS in produzione
- permessi fotocamera

Note importanti:

- su `localhost` la fotocamera funziona in sviluppo;
- per test da smartphone su rete locale serve normalmente HTTPS;
- senza licenza Scanbot il runtime è limitato alla trial di 60 secondi per sessione.

## Installazione

```bash
npm install
```

Il `postinstall` copia automaticamente il bundle Scanbot da `node_modules/scanbot-web-sdk/bundle` a `public/scanbot-web-sdk`.

## Avvio

```bash
npm run dev
```

Per build:

```bash
npm run build
npm run preview
```

## Uso operativo

1. Apri l'app.
2. Inserisci la chiave licenza Scanbot, se disponibile.
3. Premi `Nuova scansione`.
4. Inquadra ogni pagina: Scanbot mostra la guida a schermo e usa l'auto-capture quando il documento è stabile.
5. Dalla review interna puoi aggiungere, rifare, ritagliare, ruotare o eliminare pagine.
6. Conferma con `Usa documento`.
7. Premi `Genera PDF`.
8. Premi `Condividi su Telegram`.

## Integrazione Scanbot usata

La configurazione principale è in [src/main.js](/Users/tonga/Downloads/docs-scanner/src/main.js).

Scelte tecniche principali:

- `DocumentScanningFlow`
- `outputSettings.defaultFilter = ScanbotBinarizationFilter({ outputMode: "BINARY" })`
- `camera.cameraConfiguration.autoSnappingEnabled = true`
- `acknowledgementMode = "BAD_QUALITY"`
- `minimumQuality = "REASONABLE"`
- `viewFinder.visible = true`

Questa combinazione serve a favorire leggibilità e scansione stabile:

- la guida utente a schermo aiuta a centrare il foglio;
- l'auto-capture riduce il mosso;
- il filtro binarizzato forza un PDF leggibile ad alto contrasto;
- il quality gate riduce le pagine scadenti.

## Telegram

L'app **non usa il Bot API lato client**, perché esporre il token bot nel browser sarebbe scorretto.

Il pulsante `Condividi su Telegram` usa la **Web Share API**:

- su Android/iOS recenti il PDF appare nello share sheet del sistema;
- se Telegram è installato, l'utente può selezionarlo come destinazione;
- se il browser non supporta la condivisione file, l'app propone il download del PDF.

Se vuoi invio automatico a una chat Telegram senza interazione utente, serve un backend. Dettagli in [README.telegram.md](/Users/tonga/Downloads/docs-scanner/README.telegram.md).

## Persistenza locale

La bozza documento è salvata nello storage browser tramite le classi document di Scanbot. L'id bozza viene tenuto in `localStorage` per riprendere la sessione al riavvio.

Limiti pratici:

- la disponibilità dello storage dipende dal browser;
- IndexedDB può essere pulito dal sistema;
- non trattarlo come archivio definitivo.

## File principali

- [index.html](/Users/tonga/Downloads/docs-scanner/index.html): shell dell'app
- [src/main.js](/Users/tonga/Downloads/docs-scanner/src/main.js): logica app e integrazione Scanbot
- [src/styles.css](/Users/tonga/Downloads/docs-scanner/src/styles.css): UI mobile-first
- [scripts/copy-scanbot-sdk.mjs](/Users/tonga/Downloads/docs-scanner/scripts/copy-scanbot-sdk.mjs): copia bundle SDK in `public`
- [public/manifest.webmanifest](/Users/tonga/Downloads/docs-scanner/public/manifest.webmanifest): manifest PWA
- [public/sw.js](/Users/tonga/Downloads/docs-scanner/public/sw.js): service worker
- [README.telegram.md](/Users/tonga/Downloads/docs-scanner/README.telegram.md): opzioni backend Telegram

## Licenza Scanbot

Metti la chiave direttamente nella UI dell'app per test locali. In un progetto reale conviene distribuirla tramite configurazione ambiente lato build o server, secondo le policy del tuo deployment.

## Fonti ufficiali usate

- Scanbot Web SDK package README
- Scanbot docs su:
  - inizializzazione SDK
  - Document Scanner RTU UI
  - filtri immagine
  - quality analyzer
  - generazione PDF

## Limiti attuali

- nessun backend incluso per invio automatico a bot Telegram;
- icona PWA in SVG minimale, non set completo PNG;
- nessun OCR/searchable PDF attivato;
- nessuna sincronizzazione cloud dei documenti.
