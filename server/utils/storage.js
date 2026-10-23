import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, del } from '@vercel/blob';

const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

export const isBlobMode = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const isUrl = (key) => typeof key === 'string' && key.startsWith('http');

function newName(file) {
  const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  return `cand-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
}

// `file` is a multer memoryStorage file. Returns the stored key.
export async function savePhoto(file) {
  const name = newName(file);
  if (isBlobMode()) {
    const blob = await put(`candidates/${name}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return blob.url;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  return name;
}

export async function deletePhoto(key) {
  if (!key) return;
  try {
    if (isUrl(key)) {
      if (isBlobMode()) await del(key);
    } else {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(key)));
    }
  } catch { /* already gone */ }
}

export function photoUrl(key) {
  if (!key) return null;
  if (isUrl(key)) return key;
  return `/uploads/${encodeURIComponent(key)}`;
}
