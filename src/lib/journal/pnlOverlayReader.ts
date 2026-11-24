export type OverlayColor = "GREEN" | "RED" | "UNKNOWN";

export interface ParsedPnlMatch {
  pnlDollars: number;
  rawText: string;
  overlayColor: OverlayColor;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface OverlayDetectionResult {
  pnlDollars: number | null;
  overlayColor: OverlayColor;
  rawText: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  overlayCropDataUrl?: string;
  method: "COLOR_OVERLAY_OCR" | "FULL_IMAGE_OCR" | "GEMINI_VISION" | "MANUAL";
}

/**
 * Pure P&L string parser from OCR text and detected green/red overlay color.
 * Prioritizes explicit currency ($), signed (+/-), and accounting parentheses ($250.00),
 * while filtering out NQ index price ticks (e.g. 26276.75), percentages, and timestamps.
 */
export function parsePnlFromText(
  text: string,
  colorHint: OverlayColor = "UNKNOWN"
): ParsedPnlMatch | null {
  if (!text || !text.trim()) return null;

  // Normalize common OCR quirks: 'S' before digits when '$' is misread, commas/spaces
  const cleaned = text
    .replace(/\u2212|\u2013|\u2014/g, "-") // unicode minus/dashes -> ASCII '-'
    .replace(/O(?=\d)/g, "0")
    .replace(/l(?=\d)/g, "1")
    .trim();

  // Regex candidates ordered by specificity:
  // 1) Signed or parenthesized currency: +$1,250.50, -$250.00, ($250.00), $+420, $-180.25
  // 2) Plain currency: $420.00, $1,250
  // 3) Signed decimal/number without $ (not followed by %): +420.00, -250.50, +420
  const candidates: Array<{
    raw: string;
    value: number;
    hasDollar: boolean;
    hasExplicitSign: boolean;
    isNegative: boolean;
    priority: number;
  }> = [];

  // Strip percentage tokens & timestamps so they never match as P&L
  const stripped = cleaned
    .replace(/[+-]?\d+(?:\.\d+)?\s*%/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");

  const currencyRegex = /([+-]?)\s*\(\s*\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*\)|([+-]?)\s*\$\s*([+-]?)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;

  while ((m = currencyRegex.exec(stripped)) !== null) {
    if (m[2]) {
      // Parenthesized negative currency like ($250.00)
      const num = parseFloat(m[2].replace(/,/g, ""));
      if (Number.isFinite(num)) {
        candidates.push({
          raw: m[0].trim(),
          value: num,
          hasDollar: true,
          hasExplicitSign: true,
          isNegative: true,
          priority: 100
        });
      }
    } else if (m[5]) {
      const signStr = m[3] || m[4] || "";
      const num = parseFloat(m[5].replace(/,/g, ""));
      if (Number.isFinite(num)) {
        candidates.push({
          raw: m[0].trim(),
          value: num,
          hasDollar: true,
          hasExplicitSign: signStr === "+" || signStr === "-",
          isNegative: signStr === "-",
          priority: signStr ? 100 : 80
        });
      }
    }
  }

  // Fallback: signed numbers without '$' (e.g. "+420.00", "-250.00", "(250.00)")
  if (candidates.length === 0) {
    const signedRegex = /(?:^|[\s:])([+-])\s*([0-9][0-9,]*(?:\.\d{1,2})?)(?=$|[\s,])/g;
    while ((m = signedRegex.exec(stripped)) !== null) {
      const num = parseFloat(m[2].replace(/,/g, ""));
      if (Number.isFinite(num) && num < 500000) {
        candidates.push({
          raw: `${m[1]}${m[2]}`,
          value: num,
          hasDollar: false,
          hasExplicitSign: true,
          isNegative: m[1] === "-",
          priority: 60
        });
      }
    }
  }

  // Final fallback if inside a confirmed colored overlay: standalone number < 15000 with 2 decimals or integer
  if (candidates.length === 0 && colorHint !== "UNKNOWN") {
    const numRegex = /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)\b/g;
    while ((m = numRegex.exec(stripped)) !== null) {
      const num = parseFloat(m[1].replace(/,/g, ""));
      // Skip 5-digit NQ index prices (~15000-35000) when no $ sign is present
      if (Number.isFinite(num) && num > 0 && num < 10000) {
        candidates.push({
          raw: m[1],
          value: num,
          hasDollar: false,
          hasExplicitSign: false,
          isNegative: colorHint === "RED",
          priority: 30
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prefer highest priority, then larger dollar relevance (avoid tiny "1" or "2" contract badges)
  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aHasDec = a.raw.includes(".") ? 1 : 0;
    const bHasDec = b.raw.includes(".") ? 1 : 0;
    if (bHasDec !== aHasDec) return bHasDec - aHasDec;
    return b.value - a.value;
  });

  const best = candidates[0];
  let isNeg = best.isNegative;

  // Enforce color-overlay sign truth: if overlay is RED and no explicit '+' sign, treat as loss
  if (colorHint === "RED" && !best.raw.includes("+")) {
    isNeg = true;
  } else if (colorHint === "GREEN" && !best.raw.includes("-") && !best.raw.includes("(")) {
    isNeg = false;
  }

  const signedValue = Math.round((isNeg ? -Math.abs(best.value) : Math.abs(best.value)) * 100) / 100;
  const resolvedColor: OverlayColor =
    colorHint !== "UNKNOWN" ? colorHint : signedValue >= 0 ? "GREEN" : "RED";

  const confidence: ParsedPnlMatch["confidence"] =
    best.hasDollar && (best.hasExplicitSign || colorHint !== "UNKNOWN")
      ? "HIGH"
      : best.hasDollar || best.hasExplicitSign
      ? "MEDIUM"
      : "LOW";

  return {
    pnlDollars: signedValue,
    rawText: best.raw,
    overlayColor: resolvedColor,
    confidence
  };
}

interface OverlayRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  color: "GREEN" | "RED";
  pixelCount: number;
}

/**
 * Scans canvas ImageData for clustered green and red P&L overlay bounding boxes.
 */
function detectColoredOverlayRegions(
  imageData: ImageData,
  width: number,
  height: number
): OverlayRegion[] {
  const cellSize = 8;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);

  const greenCounts = new Uint16Array(cols * rows);
  const redCounts = new Uint16Array(cols * rows);

  const data = imageData.data;
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / cellSize);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 120) continue;

      const cellIdx = cy * cols + Math.floor(x / cellSize);

      // Green / emerald / teal overlay pixel
      if (g >= 85 && g - r >= 22 && g - b >= 14) {
        greenCounts[cellIdx]++;
      }
      // Red / crimson / rose overlay pixel
      else if (r >= 100 && r - g >= 26 && r - b >= 18) {
        redCounts[cellIdx]++;
      }
    }
  }

  const extractClusters = (
    counts: Uint16Array,
    color: "GREEN" | "RED"
  ): OverlayRegion[] => {
    const visited = new Uint8Array(cols * rows);
    const regions: OverlayRegion[] = [];
    const minCellPixels = 5;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const startIdx = r * cols + c;
        if (visited[startIdx] || counts[startIdx] < minCellPixels) continue;

        // BFS 8-connected components (with 1-cell gap tolerance horizontally for text characters)
        const queue: number[] = [startIdx];
        visited[startIdx] = 1;
        let minC = c;
        let maxC = c;
        let minR = r;
        let maxR = r;
        let totalPx = 0;

        while (queue.length > 0) {
          const cur = queue.shift()!;
          const cr = Math.floor(cur / cols);
          const cc = cur % cols;
          totalPx += counts[cur];
          if (cc < minC) minC = cc;
          if (cc > maxC) maxC = cc;
          if (cr < minR) minR = cr;
          if (cr > maxR) maxR = cr;

          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const nr = cr + dr;
              const nc = cc + dc;
              if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
              const nIdx = nr * cols + nc;
              if (!visited[nIdx] && counts[nIdx] >= minCellPixels) {
                visited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }

        const boxW = (maxC - minC + 1) * cellSize;
        const boxH = (maxR - minR + 1) * cellSize;

        // Filter out tiny 1-dot speckles or massive background fills (> 45% of image height & width)
        const isReasonableOverlay =
          totalPx >= 24 &&
          boxW >= 24 &&
          boxH >= 12 &&
          !(boxW > width * 0.65 && boxH > height * 0.45);

        if (isReasonableOverlay) {
          regions.push({
            x: Math.max(0, minC * cellSize - 12),
            y: Math.max(0, minR * cellSize - 10),
            w: Math.min(width, (maxC + 1) * cellSize + 12) - Math.max(0, minC * cellSize - 12),
            h: Math.min(height, (maxR + 1) * cellSize + 10) - Math.max(0, minR * cellSize - 10),
            color,
            pixelCount: totalPx
          });
        }
      }
    }

    return regions;
  };

  const all = [
    ...extractClusters(greenCounts, "GREEN"),
    ...extractClusters(redCounts, "RED")
  ];

  // Prioritize horizontal pill/banner-shaped overlays with strong color density
  all.sort((a, b) => {
    const aspectA = a.w / Math.max(1, a.h);
    const aspectB = b.w / Math.max(1, b.h);
    const pillBonusA = aspectA >= 1.4 && aspectA <= 14 ? 1.4 : 1.0;
    const pillBonusB = aspectB >= 1.4 && aspectB <= 14 ? 1.4 : 1.0;
    return b.pixelCount * pillBonusB - a.pixelCount * pillBonusA;
  });

  return all.slice(0, 6);
}

function buildHighContrastCrop(
  srcCanvas: HTMLCanvasElement,
  region: OverlayRegion,
  mode: "WHITE_TEXT_ON_COLOR" | "COLOR_TEXT_ON_DARK"
): string {
  const scale = 3;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(region.w * scale));
  out.height = Math.max(1, Math.round(region.h * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    srcCanvas,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    out.width,
    out.height
  );

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    let isTextPixel = false;
    if (mode === "WHITE_TEXT_ON_COLOR") {
      // Bright neutral/white text inside a green/red badge
      isTextPixel = lum >= 185 && Math.abs(r - g) < 45 && Math.abs(g - b) < 45;
    } else {
      // Bright green or red text on a dark chart/DOM background
      if (region.color === "GREEN") {
        isTextPixel = g >= 95 && g - r >= 20;
      } else {
        isTextPixel = r >= 105 && r - g >= 22;
      }
    }

    const val = isTextPixel ? 0 : 255;
    d[i] = val;
    d[i + 1] = val;
    d[i + 2] = val;
    d[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return out.toDataURL("image/png");
}

function buildRawColorCropPreview(
  srcCanvas: HTMLCanvasElement,
  region: OverlayRegion
): string {
  const out = document.createElement("canvas");
  out.width = region.w;
  out.height = region.h;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(srcCanvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
  return out.toDataURL("image/png");
}

/**
 * Client-side screenshot P&L extractor:
 * 1. Detects green/red P&L overlay bounding boxes via pixel clustering.
 * 2. Runs Tesseract OCR on upscaled high-contrast crops of those overlays.
 * 3. Falls back to server Gemini Vision (if configured) or full-image OCR if needed.
 */
export async function extractPnlFromScreenshot(
  imageDataUrl: string
): Promise<OverlayDetectionResult> {
  // Load image into canvas
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode screenshot image"));
    el.src = imageDataUrl;
  });

  const canvas = document.createElement("canvas");
  // Normalize ultra-huge retina screenshots to max 1600px width for fast scanning
  const maxWidth = 1600;
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      pnlDollars: null,
      overlayColor: "UNKNOWN",
      rawText: "",
      confidence: "LOW",
      method: "MANUAL"
    };
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const regions = detectColoredOverlayRegions(imageData, canvas.width, canvas.height);

  // Lazy-import tesseract.js strictly in browser
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.,+-$()USDpnlPNL "
    });

    // 1. Scan detected green/red overlay boxes first (highest precision)
    for (const region of regions) {
      const variants: Array<"WHITE_TEXT_ON_COLOR" | "COLOR_TEXT_ON_DARK"> = [
        "WHITE_TEXT_ON_COLOR",
        "COLOR_TEXT_ON_DARK"
      ];

      for (const mode of variants) {
        const cropUrl = buildHighContrastCrop(canvas, region, mode);
        if (!cropUrl) continue;
        const {
          data: { text }
        } = await worker.recognize(cropUrl);

        const parsed = parsePnlFromText(text, region.color);
        if (parsed && parsed.pnlDollars !== 0) {
          return {
            pnlDollars: parsed.pnlDollars,
            overlayColor: parsed.overlayColor,
            rawText: parsed.rawText,
            confidence: parsed.confidence,
            overlayCropDataUrl: buildRawColorCropPreview(canvas, region),
            method: "COLOR_OVERLAY_OCR"
          };
        }
      }
    }

    // 2. Fallback: Check optional server Gemini Vision if configured
    try {
      const apiRes = await fetch("/api/journal/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageDataUrl })
      });
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        if (apiJson.success && typeof apiJson.analysis?.pnlDollars === "number") {
          return {
            pnlDollars: apiJson.analysis.pnlDollars,
            overlayColor: apiJson.analysis.overlayColor || (apiJson.analysis.pnlDollars >= 0 ? "GREEN" : "RED"),
            rawText: apiJson.analysis.rawText || `$${apiJson.analysis.pnlDollars}`,
            confidence: apiJson.analysis.confidence || "HIGH",
            overlayCropDataUrl: regions[0] ? buildRawColorCropPreview(canvas, regions[0]) : undefined,
            method: "GEMINI_VISION"
          };
        }
      }
    } catch {
      // Ignore optional server analysis errors and continue to full-image OCR
    }

    // 3. Fallback: Full-image OCR scan for explicit $ currency strings
    const {
      data: { text: fullText }
    } = await worker.recognize(imageDataUrl);
    const fullParsed = parsePnlFromText(fullText, regions[0]?.color || "UNKNOWN");
    if (fullParsed) {
      return {
        pnlDollars: fullParsed.pnlDollars,
        overlayColor: fullParsed.overlayColor,
        rawText: fullParsed.rawText,
        confidence: fullParsed.confidence,
        overlayCropDataUrl: regions[0] ? buildRawColorCropPreview(canvas, regions[0]) : undefined,
        method: "FULL_IMAGE_OCR"
      };
    }
  } finally {
    await worker.terminate();
  }

  return {
    pnlDollars: null,
    overlayColor: regions[0]?.color || "UNKNOWN",
    rawText: "",
    confidence: "LOW",
    overlayCropDataUrl: regions[0] ? buildRawColorCropPreview(canvas, regions[0]) : undefined,
    method: "MANUAL"
  };
}
