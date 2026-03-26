import { PDFDocument } from "pdf-lib";

const STORAGE_KEYS = {
  pdfFilename: "docs-scanner-oss.pdf-filename",
  pdfTitle: "docs-scanner-oss.pdf-title",
  shareText: "docs-scanner-oss.share-text",
  autoScan: "docs-scanner-oss.auto-scan"
};

const DB_NAME = "docs-scanner-oss";
const DB_VERSION = 1;
const DB_STORE = "kv";
const APP_BASE_URL = new URL("./", document.baseURI);

const state = {
  cv: null,
  cvReady: false,
  stream: null,
  cameraRunning: false,
  autoScanEnabled: true,
  installPromptEvent: null,
  isInstalled:
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true,
  pages: [],
  currentPdfBytes: null,
  currentPdfName: "documento-open-source.pdf",
  lastDetection: null,
  stableFrames: 0,
  previousDetectionPoints: null,
  analysisTimer: null,
  lastCaptureAt: 0,
  isCapturing: false,
  canvases: {}
};

const elements = {
  cvStatus: document.getElementById("cv-status"),
  cameraStatus: document.getElementById("camera-status"),
  autoStatus: document.getElementById("auto-status"),
  detectionStatus: document.getElementById("detection-status"),
  noticeBox: document.getElementById("notice-box"),
  settingsForm: document.getElementById("settings-form"),
  pdfFilename: document.getElementById("pdf-filename"),
  pdfTitle: document.getElementById("pdf-title"),
  shareText: document.getElementById("share-text"),
  startCameraBtn: document.getElementById("start-camera-btn"),
  stopCameraBtn: document.getElementById("stop-camera-btn"),
  captureBtn: document.getElementById("capture-btn"),
  toggleAutoBtn: document.getElementById("toggle-auto-btn"),
  installAppBtn: document.getElementById("install-app-btn"),
  generatePdfBtn: document.getElementById("generate-pdf-btn"),
  shareTelegramBtn: document.getElementById("share-telegram-btn"),
  downloadPdfBtn: document.getElementById("download-pdf-btn"),
  clearPagesBtn: document.getElementById("clear-pages-btn"),
  cameraPreview: document.getElementById("camera-preview"),
  scannerOverlay: document.getElementById("scanner-overlay"),
  documentPolygon: document.getElementById("document-polygon"),
  cameraGuidance: document.getElementById("camera-guidance"),
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
  setupInstallPrompt();
  registerServiceWorker();
  await loadOpenCv();
  await restorePages();
  syncUi();
}

function bindEvents() {
  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    persistSettings();
    setNotice("Impostazioni salvate.", "success");
  });

  elements.startCameraBtn.addEventListener("click", async () => {
    await startCamera();
  });

  elements.stopCameraBtn.addEventListener("click", async () => {
    await stopCamera();
  });

  elements.captureBtn.addEventListener("click", async () => {
    await capturePage({ automatic: false });
  });

  elements.toggleAutoBtn.addEventListener("click", () => {
    state.autoScanEnabled = !state.autoScanEnabled;
    persistSettings();
    updateAutoUi();
    setNotice(
      state.autoScanEnabled
        ? "Auto-scan attivato. Il sistema scattera quando il foglio resta stabile."
        : "Auto-scan disattivato. Usa il pulsante Scatta pagina.",
      "info"
    );
  });

  elements.installAppBtn.addEventListener("click", async () => {
    await promptInstall();
  });

  elements.generatePdfBtn.addEventListener("click", async () => {
    await generatePdf();
  });

  elements.downloadPdfBtn.addEventListener("click", async () => {
    await downloadPdf();
  });

  elements.shareTelegramBtn.addEventListener("click", async () => {
    await sharePdf();
  });

  elements.clearPagesBtn.addEventListener("click", async () => {
    await clearPages();
  });

  window.addEventListener("beforeunload", () => {
    if (state.stream) {
      for (const track of state.stream.getTracks()) {
        track.stop();
      }
    }
  });
}

function hydrateSettings() {
  elements.pdfFilename.value =
    localStorage.getItem(STORAGE_KEYS.pdfFilename) ?? "documento-open-source.pdf";
  elements.pdfTitle.value =
    localStorage.getItem(STORAGE_KEYS.pdfTitle) ?? "Documento digitalizzato";
  elements.shareText.value =
    localStorage.getItem(STORAGE_KEYS.shareText) ??
    "Documento PDF creato con Docs Scanner OSS.";
  state.autoScanEnabled = (localStorage.getItem(STORAGE_KEYS.autoScan) ?? "true") === "true";
  updateAutoUi();
}

function persistSettings() {
  localStorage.setItem(STORAGE_KEYS.pdfFilename, sanitizePdfFilename(elements.pdfFilename.value));
  localStorage.setItem(STORAGE_KEYS.pdfTitle, elements.pdfTitle.value.trim());
  localStorage.setItem(STORAGE_KEYS.shareText, elements.shareText.value.trim());
  localStorage.setItem(STORAGE_KEYS.autoScan, String(state.autoScanEnabled));
}

async function loadOpenCv() {
  elements.cvStatus.textContent = "OpenCV in caricamento";

  const opencvImport = await import("@techstark/opencv-js");
  const cvSource = opencvImport.default ?? opencvImport;

  if (cvSource instanceof Promise) {
    state.cv = await cvSource;
  } else {
    state.cv = await new Promise((resolve) => {
      cvSource.onRuntimeInitialized = () => resolve(cvSource);
    });
  }

  state.cvReady = true;
  elements.cvStatus.textContent = "OpenCV pronto";
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setNotice("Questo browser non supporta l’accesso alla fotocamera.", "error");
    return;
  }

  if (state.cameraRunning) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    state.stream = stream;
    elements.cameraPreview.srcObject = stream;
    await elements.cameraPreview.play();

    state.cameraRunning = true;
    elements.cameraStatus.textContent = "Camera attiva";
    elements.cameraGuidance.textContent =
      "Inquadra il foglio. Il contorno verde appare quando il documento viene rilevato.";

    syncUi();
    scheduleAnalysis();
    setNotice("Fotocamera pronta.", "success");
  } catch (error) {
    console.error(error);
    setNotice(
      `Impossibile avviare la camera: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  }
}

async function stopCamera() {
  clearTimeout(state.analysisTimer);
  state.analysisTimer = null;
  state.lastDetection = null;
  state.previousDetectionPoints = null;
  state.stableFrames = 0;
  clearOverlay();

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
  }

  state.stream = null;
  state.cameraRunning = false;
  elements.cameraPreview.srcObject = null;
  elements.cameraStatus.textContent = "Camera spenta";
  elements.detectionStatus.textContent = "In attesa";
  elements.cameraGuidance.textContent =
    "Camera ferma. Riavviala per acquisire altre pagine.";
  syncUi();
}

function scheduleAnalysis() {
  clearTimeout(state.analysisTimer);

  if (!state.cameraRunning || !state.cvReady) {
    return;
  }

  state.analysisTimer = window.setTimeout(async () => {
    await analyzeFrame();
    scheduleAnalysis();
  }, 180);
}

async function analyzeFrame() {
  if (!state.cameraRunning || state.isCapturing) {
    return;
  }

  const video = elements.cameraPreview;
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  const canvas = getCanvas("analysis");
  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(320, Math.round(video.videoWidth * scale));
  const height = Math.round(video.videoHeight * scale);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, width, height);

  const detection = detectDocument(canvas);
  const previousPoints = state.previousDetectionPoints;
  state.lastDetection = detection;
  renderOverlay(detection, width, height);

  if (!detection) {
    state.previousDetectionPoints = null;
    state.stableFrames = 0;
    elements.detectionStatus.textContent = "Documento non trovato";
    elements.cameraGuidance.textContent =
      "Avvicina il foglio, evita riflessi e aumenta il contrasto con lo sfondo.";
    return;
  }

  elements.detectionStatus.textContent = `${Math.round(detection.areaRatio * 100)}% area`;

  if (previousPoints) {
    const movement = averagePointDistance(
      detection.points,
      previousPoints
    );
    state.stableFrames = movement < 14 ? state.stableFrames + 1 : 0;
  } else {
    state.stableFrames += 1;
  }

  state.previousDetectionPoints = detection.points.map((point) => ({ ...point }));

  if (state.stableFrames >= 7) {
    elements.cameraGuidance.textContent =
      state.autoScanEnabled && Date.now() - state.lastCaptureAt > 1600
        ? "Documento stabile: acquisizione automatica imminente."
        : "Documento stabile. Puoi scattare ora.";
  } else {
    elements.cameraGuidance.textContent = "Allinea i bordi del foglio e tieni la mano ferma.";
  }

  if (
    state.autoScanEnabled &&
    state.stableFrames >= 7 &&
    Date.now() - state.lastCaptureAt > 1600
  ) {
    await capturePage({ automatic: true });
  }
}

function detectDocument(canvas) {
  const cv = state.cv;
  let src;
  let gray;
  let blurred;
  let edges;
  let contours;
  let hierarchy;
  let kernel;
  let bestApprox = null;
  let bestArea = 0;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    edges = new cv.Mat();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 60, 180);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      const area = Math.abs(cv.contourArea(contour));

      if (approx.rows === 4 && area > bestArea && cv.isContourConvex(approx)) {
        if (bestApprox) {
          bestApprox.delete();
        }
        bestApprox = approx;
        bestArea = area;
      } else {
        approx.delete();
      }

      contour.delete();
    }

    if (!bestApprox) {
      return null;
    }

    const points = [];
    for (let index = 0; index < 4; index += 1) {
      points.push({
        x: bestApprox.data32S[index * 2],
        y: bestApprox.data32S[index * 2 + 1]
      });
    }

    const ordered = orderQuadPoints(points);
    const areaRatio = bestArea / (canvas.width * canvas.height);

    if (areaRatio < 0.18) {
      bestApprox.delete();
      return null;
    }

    bestApprox.delete();
    return { points: ordered, areaRatio };
  } catch (error) {
    console.warn("Document detection failed", error);
    return null;
  } finally {
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edges?.delete();
    contours?.delete();
    hierarchy?.delete();
    kernel?.delete();
    if (bestApprox) {
      try {
        bestApprox.delete();
      } catch {
        // noop
      }
    }
  }
}

async function capturePage({ automatic }) {
  if (!state.cameraRunning || state.isCapturing) {
    return;
  }

  const video = elements.cameraPreview;
  if (!video.videoWidth || !video.videoHeight) {
    return;
  }

  try {
    state.isCapturing = true;
    state.lastCaptureAt = Date.now();
    elements.cameraGuidance.textContent = automatic
      ? "Auto-scan: elaboro la pagina..."
      : "Elaboro la pagina...";
    setNotice("Elaborazione OpenCV della pagina in corso.", "info");

    const fullCanvas = getCanvas("capture");
    fullCanvas.width = video.videoWidth;
    fullCanvas.height = video.videoHeight;
    fullCanvas.getContext("2d", { willReadFrequently: true }).drawImage(
      video,
      0,
      0,
      fullCanvas.width,
      fullCanvas.height
    );

    const scaledPoints = scaleDetectionPoints(
      state.lastDetection?.points ?? null,
      getCanvas("analysis"),
      fullCanvas
    );

    const processed = processCapturedCanvas(fullCanvas, scaledPoints);
    const page = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      width: processed.width,
      height: processed.height,
      dataUrl: processed.dataUrl
    };

    state.pages.push(page);
    await dbSet("pages", state.pages);
    state.currentPdfBytes = null;
    await renderPages();

    elements.cameraGuidance.textContent = "Pagina acquisita. Continua con la successiva.";
    setNotice(
      automatic ? "Pagina acquisita automaticamente." : "Pagina acquisita.",
      "success"
    );
  } catch (error) {
    console.error(error);
    setNotice(
      `Errore durante la cattura: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  } finally {
    state.stableFrames = 0;
    state.previousDetectionPoints = null;
    state.isCapturing = false;
    syncUi();
  }
}

function processCapturedCanvas(canvas, points) {
  const cv = state.cv;
  let src;
  let warped;
  let gray;
  let denoised;
  let filtered;
  let perspective;
  let sourcePointsMat;
  let destPointsMat;

  try {
    src = cv.imread(canvas);
    const quad = points ?? deriveFullCanvasQuad(canvas);
    const ordered = orderQuadPoints(quad);
    const { width, height } = getWarpDimensions(ordered);

    sourcePointsMat = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((point) => [point.x, point.y]));
    destPointsMat = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
    perspective = cv.getPerspectiveTransform(sourcePointsMat, destPointsMat);
    warped = new cv.Mat();
    cv.warpPerspective(
      src,
      warped,
      perspective,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );

    gray = new cv.Mat();
    denoised = new cv.Mat();
    filtered = new cv.Mat();
    cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    cv.medianBlur(gray, denoised, 3);
    cv.adaptiveThreshold(
      denoised,
      filtered,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      35,
      15
    );

    const outputCanvas = getCanvas("processed");
    outputCanvas.width = width;
    outputCanvas.height = height;
    cv.imshow(outputCanvas, filtered);

    return {
      width,
      height,
      dataUrl: outputCanvas.toDataURL("image/jpeg", 0.92)
    };
  } finally {
    src?.delete();
    warped?.delete();
    gray?.delete();
    denoised?.delete();
    filtered?.delete();
    perspective?.delete();
    sourcePointsMat?.delete();
    destPointsMat?.delete();
  }
}

function deriveFullCanvasQuad(canvas) {
  const insetX = canvas.width * 0.04;
  const insetY = canvas.height * 0.04;

  return [
    { x: insetX, y: insetY },
    { x: canvas.width - insetX, y: insetY },
    { x: canvas.width - insetX, y: canvas.height - insetY },
    { x: insetX, y: canvas.height - insetY }
  ];
}

function scaleDetectionPoints(points, fromCanvas, toCanvas) {
  if (!points || !fromCanvas.width || !fromCanvas.height) {
    return null;
  }

  const scaleX = toCanvas.width / fromCanvas.width;
  const scaleY = toCanvas.height / fromCanvas.height;

  return points.map((point) => ({
    x: point.x * scaleX,
    y: point.y * scaleY
  }));
}

function getWarpDimensions(points) {
  const widthTop = distance(points[0], points[1]);
  const widthBottom = distance(points[3], points[2]);
  const heightRight = distance(points[1], points[2]);
  const heightLeft = distance(points[0], points[3]);

  return {
    width: Math.max(900, Math.round(Math.max(widthTop, widthBottom))),
    height: Math.max(1200, Math.round(Math.max(heightLeft, heightRight)))
  };
}

function orderQuadPoints(points) {
  const sums = points.map((point) => point.x + point.y);
  const diffs = points.map((point) => point.x - point.y);

  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.max(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.min(...diffs))]
  ];
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averagePointDistance(pointsA, pointsB) {
  return pointsA.reduce((sum, point, index) => sum + distance(point, pointsB[index]), 0) / pointsA.length;
}

function renderOverlay(detection, width, height) {
  elements.scannerOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!detection) {
    clearOverlay();
    return;
  }

  const points = detection.points.map((point) => `${point.x},${point.y}`).join(" ");
  elements.documentPolygon.setAttribute("points", points);
}

function clearOverlay() {
  elements.documentPolygon.setAttribute("points", "");
}

async function restorePages() {
  const storedPages = (await dbGet("pages")) ?? [];
  state.pages = Array.isArray(storedPages) ? storedPages : [];
  await renderPages();
}

async function renderPages() {
  const pageCount = state.pages.length;
  elements.pagesCount.textContent = String(pageCount);

  if (!pageCount) {
    elements.documentSummary.textContent = "Nessuna pagina salvata.";
    elements.previewGrid.innerHTML = '<div class="empty-state">Le pagine processate appariranno qui.</div>';
    syncUi();
    return;
  }

  elements.documentSummary.textContent = `${pageCount} pagina${pageCount > 1 ? "e" : ""} pronta${pageCount > 1 ? "e" : ""} per il PDF.`;
  elements.previewGrid.innerHTML = state.pages
    .map(
      (page, index) => `
        <figure class="page-card">
          <img src="${page.dataUrl}" alt="Anteprima pagina ${index + 1}" class="page-card__image" />
          <figcaption class="page-card__caption">Pagina ${index + 1}</figcaption>
        </figure>
      `
    )
    .join("");

  syncUi();
}

async function generatePdf() {
  if (!state.pages.length) {
    setNotice("Non ci sono pagine da esportare.", "warning");
    return;
  }

  try {
    setBusy(true);
    persistSettings();
    setNotice("Genero il PDF open source...", "info");

    const pdfDoc = await PDFDocument.create();
    const margin = 24;

    for (const page of state.pages) {
      const imageBytes = await fetch(page.dataUrl).then((response) => response.arrayBuffer());
      const embeddedImage = await pdfDoc.embedJpg(imageBytes);
      const isLandscape = embeddedImage.width > embeddedImage.height;
      const pageWidth = isLandscape ? 841.89 : 595.28;
      const pageHeight = isLandscape ? 595.28 : 841.89;
      const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scale = Math.min(availableWidth / embeddedImage.width, availableHeight / embeddedImage.height);
      const drawWidth = embeddedImage.width * scale;
      const drawHeight = embeddedImage.height * scale;

      pdfPage.drawImage(embeddedImage, {
        x: (pageWidth - drawWidth) / 2,
        y: (pageHeight - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight
      });
    }

    const title = elements.pdfTitle.value.trim() || "Documento digitalizzato";
    pdfDoc.setTitle(title);
    pdfDoc.setAuthor("Docs Scanner OSS");
    pdfDoc.setCreator("OpenCV.js + pdf-lib");
    pdfDoc.setProducer("Docs Scanner OSS");
    pdfDoc.setCreationDate(new Date());

    state.currentPdfBytes = await pdfDoc.save();
    state.currentPdfName = sanitizePdfFilename(elements.pdfFilename.value);
    syncUi();
    setNotice("PDF pronto.", "success");
  } catch (error) {
    console.error(error);
    setNotice(
      `Errore nella generazione PDF: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  } finally {
    setBusy(false);
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

  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files: [file] })) {
    setNotice(
      "Questo browser non supporta la condivisione file diretta. Scarica il PDF e invialo da Telegram.",
      "warning"
    );
    return;
  }

  try {
    await navigator.share({
      files: [file],
      title: elements.pdfTitle.value.trim() || "Documento digitalizzato",
      text: elements.shareText.value.trim() || "Documento PDF creato con Docs Scanner OSS."
    });
    setNotice("Share sheet aperto. Se Telegram e installato puoi inviare il PDF da li.", "success");
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

async function clearPages() {
  state.pages = [];
  state.currentPdfBytes = null;
  await dbDelete("pages");
  await renderPages();
  setNotice("Pagine eliminate dal browser.", "success");
}

function syncUi() {
  const hasPages = state.pages.length > 0;
  elements.startCameraBtn.disabled = state.cameraRunning || !state.cvReady;
  elements.stopCameraBtn.disabled = !state.cameraRunning;
  elements.captureBtn.disabled = !state.cameraRunning || state.isCapturing;
  elements.generatePdfBtn.disabled = !hasPages;
  elements.shareTelegramBtn.disabled = !hasPages;
  elements.downloadPdfBtn.disabled = !state.currentPdfBytes;
  elements.clearPagesBtn.disabled = !hasPages;
  syncInstallUi();
}

function setBusy(isBusy) {
  elements.generatePdfBtn.disabled = isBusy || !state.pages.length;
  elements.shareTelegramBtn.disabled = isBusy || !state.pages.length;
  elements.downloadPdfBtn.disabled = isBusy || !state.currentPdfBytes;
  elements.clearPagesBtn.disabled = isBusy || !state.pages.length;
  elements.captureBtn.disabled = isBusy || !state.cameraRunning;
}

function updateAutoUi() {
  elements.autoStatus.textContent = state.autoScanEnabled ? "Auto-scan attivo" : "Auto-scan manuale";
  elements.toggleAutoBtn.textContent = state.autoScanEnabled ? "Auto ON" : "Auto OFF";
}

function setNotice(message, tone = "info") {
  elements.noticeBox.textContent = message;
  elements.noticeBox.dataset.tone = tone;
}

function sanitizePdfFilename(filename) {
  const fallback = "documento-open-source.pdf";
  const cleaned = (filename || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-");

  if (!cleaned) {
    return fallback;
  }

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

function getCanvas(name) {
  if (!state.canvases[name]) {
    state.canvases[name] = document.createElement("canvas");
  }

  return state.canvases[name];
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register(new URL("sw.js", APP_BASE_URL)).catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPromptEvent = event;
    syncInstallUi();
    setNotice("Installazione PWA disponibile su questo device.", "success");
  });

  window.addEventListener("appinstalled", () => {
    state.installPromptEvent = null;
    state.isInstalled = true;
    syncInstallUi();
    setNotice("App installata correttamente.", "success");
  });

  syncInstallUi();
}

function syncInstallUi() {
  const canInstall = Boolean(state.installPromptEvent) && !state.isInstalled;
  elements.installAppBtn.hidden = !canInstall;
  elements.installAppBtn.disabled = !canInstall;
}

async function promptInstall() {
  if (!state.installPromptEvent) {
    setNotice(
      "Prompt di installazione non disponibile. Su Android serve HTTPS e un browser compatibile.",
      "warning"
    );
    return;
  }

  const promptEvent = state.installPromptEvent;
  await promptEvent.prompt();
  await promptEvent.userChoice;
  state.installPromptEvent = null;
  syncInstallUi();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbSet(key, value) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ key, value });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(key) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}
