// pixelCompare.ts — Client-side jewelry image comparison via perceptual hashing + color histograms.
// Zero external dependencies. Uses only Canvas API.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PixelFidelityResult {
  scores: { pHashDistance: number; histogramCorrelation: number };
  passed: boolean;
  diagnosis: 'shape' | 'color' | 'both' | 'none';
}

export interface SegmentationResult {
  box_2d: [number, number, number, number];
  mask: string;
  label: string;
}

type PHash = [number, number]; // [high32, low32]

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASH_SIZE = 32;
const DCT_LOW = 8;
const HUE_BINS = 16;
const SAT_BINS = 4;
const VAL_BINS = 4;
const HISTOGRAM_BINS = HUE_BINS * SAT_BINS * VAL_BINS; // 256

const PHASH_THRESHOLD = 8;
const HISTOGRAM_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

function drawImageDataToCanvas(data: ImageData, w: number, h: number): ImageData {
  const [src, srcCtx] = createCanvas(data.width, data.height);
  srcCtx.putImageData(data, 0, 0);
  const [dst, dstCtx] = createCanvas(w, h);
  dstCtx.drawImage(src, 0, 0, w, h);
  return dstCtx.getImageData(0, 0, w, h);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Grayscale + DCT-based perceptual hash
// ---------------------------------------------------------------------------

function toGrayscaleMatrix(data: ImageData, size: number): number[][] {
  const resized = data.width === size && data.height === size
    ? data
    : drawImageDataToCanvas(data, size, size);

  const px = resized.data;
  const matrix: number[][] = [];
  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      row.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    }
    matrix.push(row);
  }
  return matrix;
}

function dct2d(matrix: number[][], n: number): number[][] {
  // Row-wise 1D DCT, then column-wise 1D DCT (separable).
  const piOver2N = Math.PI / (2 * n);

  // Precompute cosine table
  const cosTable: number[][] = [];
  for (let k = 0; k < n; k++) {
    cosTable[k] = [];
    for (let i = 0; i < n; i++) {
      cosTable[k][i] = Math.cos(piOver2N * k * (2 * i + 1));
    }
  }

  // DCT on rows
  const intermediate: number[][] = [];
  for (let y = 0; y < n; y++) {
    intermediate[y] = [];
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let x = 0; x < n; x++) {
        sum += matrix[y][x] * cosTable[k][x];
      }
      intermediate[y][k] = sum;
    }
  }

  // DCT on columns
  const result: number[][] = [];
  for (let k = 0; k < n; k++) {
    result[k] = [];
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let y = 0; y < n; y++) {
        sum += intermediate[y][j] * cosTable[k][y];
      }
      result[k][j] = sum;
    }
  }

  return result;
}

function computePHash(data: ImageData): PHash {
  const gray = toGrayscaleMatrix(data, PHASH_SIZE);
  const dct = dct2d(gray, PHASH_SIZE);

  // Collect top-left 8x8 DCT coefficients, excluding DC at [0,0]
  const coeffs: number[] = [];
  for (let y = 0; y < DCT_LOW; y++) {
    for (let x = 0; x < DCT_LOW; x++) {
      if (y === 0 && x === 0) continue;
      coeffs.push(dct[y][x]);
    }
  }

  // Median
  const sorted = [...coeffs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  // Build 64-bit hash as [high32, low32]
  // We have 63 coefficients; pad bit 63 (MSB of high32) with 0.
  let high = 0;
  let low = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const bit = coeffs[i] > median ? 1 : 0;
    if (i < 32) {
      low |= bit << i;
    } else {
      high |= bit << (i - 32);
    }
  }

  return [high, low];
}

// ---------------------------------------------------------------------------
// Hamming distance (Brian Kernighan popcount)
// ---------------------------------------------------------------------------

function popcount32(x: number): number {
  let v = x >>> 0;
  let count = 0;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

function hammingDistance(a: PHash, b: PHash): number {
  return popcount32(a[0] ^ b[0]) + popcount32(a[1] ^ b[1]);
}

// ---------------------------------------------------------------------------
// RGB → HSV conversion + histogram
// ---------------------------------------------------------------------------

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return [h, s, v];
}

function computeHSVHistogram(data: ImageData): Float64Array {
  const hist = new Float64Array(HISTOGRAM_BINS);
  const px = data.data;
  let count = 0;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue; // skip transparent
    const [h, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2]);

    const hBin = Math.min(Math.floor(h * HUE_BINS), HUE_BINS - 1);
    const sBin = Math.min(Math.floor(s * SAT_BINS), SAT_BINS - 1);
    const vBin = Math.min(Math.floor(v * VAL_BINS), VAL_BINS - 1);

    hist[hBin * SAT_BINS * VAL_BINS + sBin * VAL_BINS + vBin]++;
    count++;
  }

  // Normalize
  if (count > 0) {
    for (let i = 0; i < HISTOGRAM_BINS; i++) {
      hist[i] /= count;
    }
  }

  return hist;
}

// ---------------------------------------------------------------------------
// Pearson correlation
// ---------------------------------------------------------------------------

function histogramCorrelation(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a base64 image string to ImageData via offscreen canvas.
 * If width/height are omitted, the image's natural dimensions are used.
 */
export async function base64ToImageData(
  base64: string,
  width?: number,
  height?: number,
): Promise<ImageData> {
  const src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
  const img = await loadImage(src);
  const w = width ?? img.naturalWidth;
  const h = height ?? img.naturalHeight;
  const [, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Extract a cropped ImageData from a full image using a segmentation result.
 * Applies the mask so only jewelry pixels are retained (alpha=0 elsewhere).
 */
export async function cropFromSegmentation(
  imageBase64: string,
  segmentation: SegmentationResult,
): Promise<ImageData> {
  const src = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;
  const img = await loadImage(src);

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // box_2d is normalized to 0-1000
  const [y1n, x1n, y2n, x2n] = segmentation.box_2d;
  const x1 = Math.round((x1n / 1000) * iw);
  const y1 = Math.round((y1n / 1000) * ih);
  const x2 = Math.round((x2n / 1000) * iw);
  const y2 = Math.round((y2n / 1000) * ih);
  const cropW = Math.max(x2 - x1, 1);
  const cropH = Math.max(y2 - y1, 1);

  // Draw cropped region
  const [, cropCtx] = createCanvas(cropW, cropH);
  cropCtx.drawImage(img, x1, y1, cropW, cropH, 0, 0, cropW, cropH);
  const cropData = cropCtx.getImageData(0, 0, cropW, cropH);

  // Load and resize mask
  const maskSrc = segmentation.mask.startsWith('data:')
    ? segmentation.mask
    : `data:image/png;base64,${segmentation.mask}`;
  const maskImg = await loadImage(maskSrc);
  const [, maskCtx] = createCanvas(cropW, cropH);
  maskCtx.drawImage(maskImg, 0, 0, cropW, cropH);
  const maskData = maskCtx.getImageData(0, 0, cropW, cropH);

  // Apply mask: zero alpha where mask luminance < 128
  const px = cropData.data;
  const mx = maskData.data;
  for (let i = 0; i < px.length; i += 4) {
    const maskVal = 0.299 * mx[i] + 0.587 * mx[i + 1] + 0.114 * mx[i + 2];
    if (maskVal < 128) {
      px[i + 3] = 0;
    }
  }

  return cropData;
}

/**
 * Compare two jewelry crops and return fidelity scores.
 * Pass threshold: pHash distance <= 8 AND histogram correlation >= 0.75.
 */
export function compareJewelryCrops(cropA: ImageData, cropB: ImageData): PixelFidelityResult {
  // Resize both to the smaller dimensions for fair comparison
  const w = Math.min(cropA.width, cropB.width);
  const h = Math.min(cropA.height, cropB.height);

  const a = (cropA.width === w && cropA.height === h)
    ? cropA
    : drawImageDataToCanvas(cropA, w, h);
  const b = (cropB.width === w && cropB.height === h)
    ? cropB
    : drawImageDataToCanvas(cropB, w, h);

  const hashA = computePHash(a);
  const hashB = computePHash(b);
  const pHashDistance = hammingDistance(hashA, hashB);

  const histA = computeHSVHistogram(a);
  const histB = computeHSVHistogram(b);
  const corr = histogramCorrelation(histA, histB);

  const shapeFail = pHashDistance > PHASH_THRESHOLD;
  const colorFail = corr < HISTOGRAM_THRESHOLD;

  let diagnosis: PixelFidelityResult['diagnosis'];
  if (shapeFail && colorFail) diagnosis = 'both';
  else if (shapeFail) diagnosis = 'shape';
  else if (colorFail) diagnosis = 'color';
  else diagnosis = 'none';

  return {
    scores: { pHashDistance, histogramCorrelation: corr },
    passed: !shapeFail && !colorFail,
    diagnosis,
  };
}
