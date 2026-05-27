// Client-side avatar pipeline:
//  1. Read the user's selected image
//  2. Resize + center-crop to 256x256 via <canvas>
//  3. Encode WebP at quality 0.85 (~30-50 KB typical)
//  4. Upload to avatars/<userId>/avatar.webp via the Supabase client
//
// The same canonical path is reused on every upload so old files get
// replaced. The bucket is public-read; the resulting URL is the
// permanent public URL.

import { createClient } from '@/lib/supabase/client';

const TARGET_SIZE = 256;
const WEBP_QUALITY = 0.85;
const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB before resize
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type AvatarUploadResult = {
  publicUrl: string;
};

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<AvatarUploadResult> {
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Image too large (max 5 MB).');
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('Unsupported file type. Use JPEG, PNG, or WebP.');
  }

  const blob = await resizeImageToSquare(file, TARGET_SIZE, WEBP_QUALITY);

  const supabase = createClient();
  const path = `${userId}/avatar.webp`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '3600',
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path);

  // Append a cache-busting query so the new image shows immediately
  // even though the path is reused.
  const bustedUrl = `${publicUrl}?v=${Date.now()}`;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: bustedUrl })
    .eq('id', userId);
  if (profileError) {
    throw new Error(profileError.message);
  }

  return { publicUrl: bustedUrl };
}

async function resizeImageToSquare(
  file: File,
  size: number,
  quality: number,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');

    // Center-crop the source to a square before drawing.
    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - minDim) / 2;
    const sy = (img.naturalHeight - minDim) / 2;
    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality);
    });
    if (!blob) throw new Error('Failed to encode avatar.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
