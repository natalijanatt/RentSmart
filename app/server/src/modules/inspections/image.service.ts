import { supabase } from '../../shared/db/index.js';
import { sha256Buffer } from '../../shared/utils/hash.js';

const BUCKET = 'rentsmart-images';

export async function uploadImage(
  contractId: string,
  inspectionType: 'checkin' | 'checkout',
  roomType: string,
  imageBuffer: Buffer,
  index: number,
): Promise<{ url: string; hash: string }> {
  const hash = sha256Buffer(imageBuffer);
  const path = `${contractId}/${inspectionType}/${roomType}/img_${String(index).padStart(3, '0')}_${hash.slice(0, 8)}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return { url: urlData.publicUrl, hash };
}

export async function downloadImage(imageUrl: string): Promise<Buffer> {
  const path = imageUrl.split(`${BUCKET}/`)[1];

  if (!path) {
    // Fallback: direct fetch for URLs not in Supabase Storage format
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (error || !data) throw new Error(`Image download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
