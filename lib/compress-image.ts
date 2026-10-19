// Browser-only helper: shrink phone photos before upload so a 5–15 MB camera image
// becomes a ~0.5–1.5 MB JPEG that is still perfectly readable as a document scan.
const MAX_DIMENSION = 2200;
const JPEG_QUALITY = 0.82;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall back to <img>, which also handles formats some browsers can't bitmap-decode.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Returns a resized JPEG for images, or the original file for PDFs and anything it can't decode. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) return file;
  const { source, width, height } = await decode(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; // transparent PNG areas become white instead of black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source && typeof source.close === "function") source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) return file;
  // Keep the original if it is already a small JPEG/PNG and re-encoding didn't help.
  if (blob.size >= file.size && /^image\/(jpeg|png)$/.test(file.type)) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}
