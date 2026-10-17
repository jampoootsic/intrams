const MAX_DIM = 1600;
const MAX_BYTES = 1024 * 1024;
const QUALITY = 0.85;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close && bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Downscale large photos in the browser before upload. Returns the original
// file unchanged when it is small enough or cannot be decoded (e.g. HEIC).
export async function prepareImageForUpload(file) {
  if (!file) return file;
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return file;
  }
  try {
    const { source, width, height } = decoded;
    if (!width || !height) return file;
    if (width <= MAX_DIM && height <= MAX_DIM && file.size <= MAX_BYTES) return file;

    const scale = Math.min(1, MAX_DIM / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no alpha
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return file;
    const base = (file.name || 'photo').replace(/\.[^.]*$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    decoded.release();
  }
}
