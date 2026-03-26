# Docs Scanner OSS

PWA open source per:

- acquisire documenti con la fotocamera del browser;
- rilevare il foglio con OpenCV.js;
- correggere la prospettiva;
- convertire la pagina in bianco/nero ad alto contrasto;
- comporre un PDF locale;
- condividerlo su Telegram tramite share sheet nativo.

## Stack

- `@techstark/opencv-js`
- `pdf-lib`
- API browser: `getUserMedia`, `Canvas`, `IndexedDB`, `Web Share API`
- `vite`

## Cosa cambia rispetto a Scanbot

Questa versione non richiede:

- chiave licenza;
- SDK proprietari;
- servizi esterni.

Tutto gira nel browser.

## Funzioni principali

- camera live da browser;
- rilevamento contorno documento con OpenCV;
- auto-scan basato su stabilita del documento;
- correzione prospettica;
- filtro binarizzato forte per leggibilita;
- salvataggio pagine in IndexedDB;
- export PDF multipagina;
- share su Telegram via `navigator.share()` quando supportato.

## Requisiti

- browser moderno;
- fotocamera disponibile;
- `localhost` o HTTPS per usare la camera in modo corretto;
- buona illuminazione e sfondo con contrasto rispetto al foglio.

## Avvio

```bash
npm install
npm run dev
```

Build produzione:

```bash
npm run build
npm run preview
```

## Come si usa

1. Apri l'app.
2. Premi `Avvia camera`.
3. Inquadra il foglio.
4. Lascia `Auto ON` per lo scatto automatico oppure usa `Scatta pagina`.
5. Ripeti per tutte le pagine.
6. Premi `Genera PDF`.
7. Usa `Condividi su Telegram` oppure `Scarica PDF`.

## Limiti tecnici

Essendo open source e browser-only, questa pipeline e meno robusta di un SDK commerciale in alcuni casi:

- documenti con forte riflesso;
- sfondi molto simili al colore del foglio;
- bordi poco netti;
- motion blur forte;
- device lenti.

Per risultati migliori:

- usa luce uniforme;
- evita tavoli bianchi con fogli bianchi;
- riempi gran parte del frame con il documento;
- tieni il telefono il piu fermo possibile.

## Persistenza locale

Le pagine elaborate vengono salvate in IndexedDB nel browser. Restano disponibili al riavvio della PWA finche il browser non cancella i dati locali.

## Telegram

L'app non usa bot Telegram lato client. La condivisione del PDF passa tramite share sheet del sistema. Se il browser non supporta la condivisione file, il fallback corretto e il download del PDF.

Dettagli aggiuntivi in [README.telegram.md](/Users/tonga/Documents/GitHub/docs-scanner/README.telegram.md).

## File principali

- [index.html](/Users/tonga/Documents/GitHub/docs-scanner/index.html)
- [src/main.js](/Users/tonga/Documents/GitHub/docs-scanner/src/main.js)
- [src/styles.css](/Users/tonga/Documents/GitHub/docs-scanner/src/styles.css)
- [package.json](/Users/tonga/Documents/GitHub/docs-scanner/package.json)
