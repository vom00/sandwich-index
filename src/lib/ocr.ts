/**
 * The text in a photo, read on this device.
 *
 * tesseract.js runs the OCR in a Web Worker, so the photo is never uploaded:
 * not to this site, not to anyone. Only what the person then submits through
 * the form leaves the device, and that is the same price, store and source a
 * typed report sends. A receipt also carries card digits and order numbers,
 * and this is how they stay off our servers.
 *
 * Everything loads on first use, from this site (`scripts/copy-ocr-assets.mjs`
 * puts it in public/ocr/): the library, one engine build of about 3.9 MB, and
 * the 2.95 MB English model, which tesseract.js keeps in IndexedDB afterwards.
 * Nothing of it is in any page's bundle.
 */

export interface OcrProgress {
  /** tesseract.js's own words: "loading language traineddata", "recognizing text". */
  status: string;
  /** 0 to 1, for the current status. */
  progress: number;
}

/**
 * Phone photos run to 12 megapixels and more. OCR time grows with pixels, and
 * receipt text stays legible well below this.
 */
const MAX_SIDE = 2400;

async function shrink(file: Blob): Promise<Blob | HTMLCanvasElement> {
  if (typeof createImageBitmap !== "function") return file;
  // Applies the photo's EXIF rotation, so a sideways phone shot reads upright.
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function readTextOnDevice(
  file: Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<string> {
  const [{ createWorker }, image] = await Promise.all([import("tesseract.js"), shrink(file)]);

  // Absolute URLs: the worker runs from a blob: URL, which has no base to
  // resolve a relative path against.
  const origin = window.location.origin;
  const worker = await createWorker("eng", 1, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    logger: (message: { status: string; progress: number }) =>
      onProgress?.({ status: message.status, progress: message.progress }),
  });

  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
