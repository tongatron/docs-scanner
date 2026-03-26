import "./styles.css";

const STORAGE_KEYS = {
  licenseKey: "docs-scanner.license-key",
  currentDocumentId: "docs-scanner.current-document-id",
  pdfFilename: "docs-scanner.pdf-filename",
  pdfTitle: "docs-scanner.pdf-title",
  shareText: "docs-scanner.share-text"
};

const ENGINE_PATH = "/scanbot-web-sdk/bin/complete/";

const state = {
  sdk: null,
  initializedLicense: null,
  currentDocument: null,
  currentDocumentId: null,
  currentPdfBytes: null,
  currentPdfName: "documento-scanbot.pdf",
  previewUrls: []
};

const elements = {
  sdkStatus: document.getElementById("sdk-status"),
  noticeBox: document.getElementById("notice-box"),
  settingsForm: document.getElementById("settings-form"),
  licenseKey: document.getElementById("license-key"),
  pdfFilename: document.getElementById("pdf-filename"),
  pdfTitle: document.getElementById("pdf-title"),
  shareText: document.getElementById("share-text"),
  scanNewBtn: document.getElementById("scan-new-btn"),
  scanContinueBtn: document.getElementById("scan-continue-btn"),
  generatePdfBtn: document.getElementById("generate-pdf-btn"),
  shareTelegramBtn: document.getElementById("share-telegram-btn"),
  downloadPdfBtn: document.getElementById("download-pdf-btn"),
  clearDocumentBtn: document.getElementById("clear-document-btn"),
  pagesCount: document.getElementById("pages-count"),
  documentSummary: document.getElementById("document-summary"),
  previewGrid: document.getElementById("preview-grid")
};

bootstrap().catch((error) => {
  console.error(error);
  setNotice(
    `Errore di inizializzazione: ${error instanceof Error ? error.message : String(error)}`,
    "error"
  );
});

async function bootstrap() {
  hydrateSettings();
  bindEvents();
  registerServiceWorker();
  await initializeSdk(getLicenseKey());
  await restoreStoredDocument();
  syncButtons();
}

function bindEvents() {
  elements.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    persistSettings();
    await initializeSdk(getLicenseKey(), { force: true });
    setNotice("Impostazioni salvate.", "success");
  });

  elements.scanNewBtn.addEventListener("click", async () => {
    await openScanner({ resetDocument: true });
  });

  elements.scanContinueBtn.addEventListener("click", async () => {
    await openScanner({ resetDocument: false });
  });

  elements.generatePdfBtn.addEventListener("click", async () => {
    await generatePdf();
  });

  elements.shareTelegramBtn.addEventListener("click", async () => {
    await sharePdf();
  });

  elements.downloadPdfBtn.addEventListener("click", async () => {
    await downloadPdf();
  });

  elements.clearDocumentBtn.addEventListener("click", async () => {
    await clearCurrentDocument();
  });
}

function hydrateSettings() {
  elements.licenseKey.value = localStorage.getItem(STORAGE_KEYS.licenseKey) ?? "";
  elements.pdfFilename.value =
    localStorage.getItem(STORAGE_KEYS.pdfFilename) ?? "documento-scanbot.pdf";
  elements.pdfTitle.value =
    localStorage.getItem(STORAGE_KEYS.pdfTitle) ?? "Documento digitalizzato";
  elements.shareText.value =
    localStorage.getItem(STORAGE_KEYS.shareText) ??
    "Documento PDF creato con Docs Scanner.";
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.licenseKey, elements.licenseKey.value.trim());
  localStorage.setItem(STORAGE_KEYS.pdfFilename, sanitizePdfFilename(elements.pdfFilename.value));
  localStorage.setItem(STORAGE_KEYS.pdfTitle, elements.pdfTitle.value.trim());
  localStorage.setItem(STORAGE_KEYS.shareText, elements.shareText.value.trim());
}

function getLicenseKey() {
  return elements.licenseKey.value.trim();
}

async function initializeSdk(licenseKey, options = {}) {
  const { force = false } = options;

  if (!force && state.sdk && state.initializedLicense === licenseKey) {
    return state.sdk;
  }

  elements.sdkStatus.textContent = "Inizializzazione Scanbot...";

  state.sdk = await window.ScanbotSDK.initialize({
    licenseKey,
    enginePath: ENGINE_PATH
  });

  state.initializedLicense = licenseKey;

  const licenseInfo = await state.sdk.getLicenseInfo();
  const isTrial = !licenseKey;
  const statusLabel = licenseInfo?.isValid
    ? "Licenza valida"
    : isTrial
      ? "Trial 60s"
      : "Licenza non valida";

  elements.sdkStatus.textContent = statusLabel;
  return state.sdk;
}

async function restoreStoredDocument() {
  const documentId = Number(localStorage.getItem(STORAGE_KEYS.currentDocumentId));

  if (!documentId) {
    renderDocumentState();
    return;
  }

  try {
    const document = await window.ScanbotSDK.UI.SBDocument.loadFromStorage(documentId);
    state.currentDocument = document;
    state.currentDocumentId = documentId;
    setNotice("Bozza precedente ripristinata dal browser.", "info");
  } catch (error) {
    console.warn("Unable to restore stored document", error);
    localStorage.removeItem(STORAGE_KEYS.currentDocumentId);
    state.currentDocument = null;
    state.currentDocumentId = null;
    setNotice("La bozza salvata non è più disponibile.", "warning");
  }

  await renderDocumentState();
}

async function openScanner({ resetDocument }) {
  try {
    persistSettings();
    await initializeSdk(getLicenseKey());
    state.currentPdfBytes = null;

    if (resetDocument && state.currentDocument) {
      await clearCurrentDocument({ silent: true });
    }

    setBusy(true);
    setNotice("Apro la fotocamera Scanbot...", "info");

    const scanConfig = createDocumentScannerConfig(resetDocument);
    const documentId = resetDocument ? undefined : state.currentDocumentId ?? undefined;
    const result = await window.ScanbotSDK.UI.createDocumentScanner(scanConfig, documentId);

    if (!result?.document) {
      setNotice("Scansione annullata.", "warning");
      return;
    }

    state.currentDocument = result.document;
    state.currentDocumentId = await state.currentDocument.updateStorageDocument();
    localStorage.setItem(STORAGE_KEYS.currentDocumentId, String(state.currentDocumentId));

    await renderDocumentState();
    setNotice("Documento aggiornato con successo.", "success");
  } catch (error) {
    console.error(error);
    setNotice(
      `Errore durante la scansione: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

function createDocumentScannerConfig(resetDocument) {
  const Config = window.ScanbotSDK.UI.Config;

  return new Config.DocumentScanningFlow({
    cleanScanningSession: resetDocument,
    showReviewScreenOnStart: false,
    outputSettings: {
      pagesScanLimit: 0,
      documentImageSizeLimit: 2480,
      documentAnalysisMode: "FILTERED_DOCUMENT",
      defaultFilter: new Config.ScanbotBinarizationFilter({
        outputMode: "BINARY"
      })
    },
    localization: {
      cameraTopBarTitle: "Scansiona documento",
      cameraTopGuidance: "Una pagina alla volta, con cattura automatica.",
      cameraUserGuidanceStart: "Inquadra il foglio dentro il riquadro.",
      cameraUserGuidanceReadyToCapture: "Tieni ferma la mano: cattura in corso...",
      cameraUserGuidanceReadyToCaptureManual: "Pronto per lo scatto.",
      cameraUserGuidanceTooDark: "Serve piu luce per una scansione leggibile.",
      cameraPreviewButtonTitle: "%d pagine",
      reviewScreenTitle: "Revisione (%d)",
      reviewScreenSubmitButtonTitle: "Usa documento",
      reviewScreenAddButtonTitle: "Aggiungi",
      reviewScreenRetakeButtonTitle: "Rifai",
      reviewScreenCropButtonTitle: "Ritaglia",
      reviewScreenRotateButtonTitle: "Ruota",
      reviewScreenDeleteButtonTitle: "Elimina",
      acknowledgementScreenBadDocumentHint:
        "La qualita non basta ancora. Puoi rifare la pagina.",
      acknowledgementRetakeButtonTitle: "Rifai",
      acknowledgementAcceptButtonTitle: "Tieni pagina"
    },
    appearance: {
      topBarBackgroundColor: "#16302b",
      bottomBarBackgroundColor: "#16302b"
    },
    palette: {
      sbColorPrimary: "#16302b",
      sbColorPrimaryDisabled: "#b7c4c1",
      sbColorNegative: "#c44536",
      sbColorPositive: "#1f8f74",
      sbColorWarning: "#d4a419",
      sbColorSecondary: "#eef4ef",
      sbColorSecondaryDisabled: "#e1e9e4",
      sbColorOnPrimary: "#f7f5ef",
      sbColorOnSecondary: "#16302b",
      sbColorSurface: "#f7f5ef",
      sbColorOutline: "#d3ddd8",
      sbColorOnSurfaceVariant: "#576662",
      sbColorOnSurface: "#16302b",
      sbColorSurfaceLow: "#16302b26",
      sbColorSurfaceHigh: "#16302b8c",
      sbColorModalOverlay: "#0f1615b0"
    },
    screens: {
      camera: {
        openReviewAfterEachScan: false,
        autoRotateImages: true,
        acknowledgement: {
          acknowledgementMode: "BAD_QUALITY",
          minimumQuality: "REASONABLE"
        },
        cameraConfiguration: {
          cameraModule: "BACK",
          autoCropOnManualSnap: true,
          flashEnabled: false,
          autoSnappingEnabled: true,
          autoSnappingSensitivity: 0.9,
          autoSnappingDelay: 250,
          fpsLimit: 20,
          cameraLiveScannerResolution: "FULL_HD",
          idealPreviewResolution: {
            width: 1920,
            height: 1080
          }
        },
        viewFinder: {
          visible: true
        },
        scanAssistanceOverlay: {
          visible: false
        }
      },
      review: {
        enabled: true,
        showLastPageWhenAdding: true
      }
    }
  });
}

async function generatePdf() {
  if (!state.currentDocument) {
    setNotice("Non ci sono pagine da esportare.", "warning");
    return;
  }

  try {
    setBusy(true);
    setNotice("Genero il PDF...", "info");

    const pdfFilename = sanitizePdfFilename(elements.pdfFilename.value);
    const pdfTitle = elements.pdfTitle.value.trim() || "Documento digitalizzato";

    const bytes = await state.currentDocument.createPdf({
      pageSize: "A4",
      pageDirection: "PORTRAIT",
      pageFit: "FIT_IN",
      dpi: 200,
      jpegQuality: 90,
      attributes: {
        title: pdfTitle,
        author: "Docs Scanner",
        creator: "Docs Scanner PWA"
      }
    });

    state.currentPdfBytes = bytes;
    state.currentPdfName = pdfFilename;

    syncButtons();
    setNotice("PDF pronto.", "success");
  } catch (error) {
    console.error(error);
    setNotice(
      `Errore durante la creazione del PDF: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function sharePdf() {
  if (!state.currentPdfBytes) {
    await generatePdf();
  }

  if (!state.currentPdfBytes) {
    return;
  }

  const file = new File([state.currentPdfBytes], state.currentPdfName, {
    type: "application/pdf"
  });

  const shareData = {
    files: [file],
    title: elements.pdfTitle.value.trim() || "Documento digitalizzato",
    text: elements.shareText.value.trim() || "Documento PDF creato con Docs Scanner."
  };

  try {
    if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) {
      setNotice(
        "Questo browser non supporta la condivisione diretta del file. Scarica il PDF e invialo da Telegram.",
        "warning"
      );
      return;
    }

    await navigator.share(shareData);
    setNotice(
      "Share sheet aperto. Se Telegram e disponibile sul dispositivo, puoi inviare il PDF da li.",
      "success"
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      setNotice("Condivisione annullata.", "warning");
      return;
    }

    console.error(error);
    setNotice(
      `Errore durante la condivisione: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  }
}

async function downloadPdf() {
  if (!state.currentPdfBytes) {
    await generatePdf();
  }

  if (!state.currentPdfBytes) {
    return;
  }

  const blob = new Blob([state.currentPdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = state.currentPdfName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setNotice("Download PDF avviato.", "success");
}

async function clearCurrentDocument(options = {}) {
  const { silent = false } = options;

  if (state.currentDocument) {
    await state.currentDocument.delete();
  }

  revokePreviewUrls();
  state.currentDocument = null;
  state.currentDocumentId = null;
  state.currentPdfBytes = null;
  localStorage.removeItem(STORAGE_KEYS.currentDocumentId);

  renderDocumentState();

  if (!silent) {
    setNotice("Bozza eliminata.", "success");
  }
}

async function renderDocumentState() {
  revokePreviewUrls();

  const pageCount = state.currentDocument?.pageCount ?? 0;
  elements.pagesCount.textContent = String(pageCount);

  if (!state.currentDocument || !pageCount) {
    elements.documentSummary.textContent = "Nessuna bozza caricata.";
    elements.previewGrid.innerHTML =
      '<div class="empty-state">Nessuna pagina acquisita. Avvia una scansione per vedere l’anteprima.</div>';
    syncButtons();
    return;
  }

  elements.documentSummary.textContent = `Bozza locale #${state.currentDocumentId} con ${pageCount} pagine.`;
  elements.previewGrid.innerHTML = "";

  for (let index = 0; index < pageCount; index += 1) {
    const page = state.currentDocument.pageAtIndex(index);
    const image = (await page.loadDocumentImage()) ?? (await page.loadOriginalImage());
    const bytes = await image.toJpeg(80);
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));

    state.previewUrls.push(url);

    const figure = document.createElement("figure");
    figure.className = "page-card";
    figure.innerHTML = `
      <img src="${url}" alt="Anteprima pagina ${index + 1}" class="page-card__image" />
      <figcaption class="page-card__caption">Pagina ${index + 1}</figcaption>
    `;

    elements.previewGrid.appendChild(figure);
  }

  syncButtons();
}

function revokePreviewUrls() {
  for (const url of state.previewUrls) {
    URL.revokeObjectURL(url);
  }

  state.previewUrls = [];
}

function syncButtons() {
  const hasDocument = Boolean(state.currentDocument && state.currentDocument.pageCount > 0);
  const hasPdf = Boolean(state.currentPdfBytes);

  elements.scanContinueBtn.disabled = !hasDocument;
  elements.generatePdfBtn.disabled = !hasDocument;
  elements.clearDocumentBtn.disabled = !hasDocument;
  elements.shareTelegramBtn.disabled = !hasDocument;
  elements.downloadPdfBtn.disabled = !hasDocument || !hasPdf;
}

function setBusy(isBusy) {
  const controls = [
    elements.scanNewBtn,
    elements.scanContinueBtn,
    elements.generatePdfBtn,
    elements.shareTelegramBtn,
    elements.downloadPdfBtn,
    elements.clearDocumentBtn
  ];

  for (const control of controls) {
    control.disabled = isBusy || control.disabled;
    control.dataset.busyLocked = isBusy ? "true" : "false";
  }

  if (!isBusy) {
    syncButtons();
  }
}

function setNotice(message, tone = "info") {
  elements.noticeBox.textContent = message;
  elements.noticeBox.dataset.tone = tone;
}

function sanitizePdfFilename(filename) {
  const fallback = "documento-scanbot.pdf";
  const cleaned = (filename || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");

  if (!cleaned) {
    return fallback;
  }

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}
