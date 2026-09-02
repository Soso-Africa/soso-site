export const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const VIDEO_MEDIA_TYPES = new Set(["video/mp4", "video/webm"]);
export const MAX_UPLOADED_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_HERO_POSTER_BYTES = 512 * 1024;
export const MAX_HERO_VIDEO_BYTES = 8 * 1024 * 1024;
export const MAX_GARMENT_MASK_PIXELS = 16_000_000;

export function imageDimensions(
  bytes: Uint8Array,
  contentType: string,
): { width: number; height: number } | null {
  const buffer = Buffer.from(bytes);
  if (contentType === "image/png" && bytes.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += length + 2;
    }
  }
  if (contentType === "image/webp" && bytes.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const packed = buffer.readUInt32LE(21);
      return {
        width: 1 + (packed & 0x3fff),
        height: 1 + ((packed >>> 14) & 0x3fff),
      };
    }
  }
  return null;
}

export function mediaMimeTypeForPath(path: string): string | null {
  const pathname = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".webm")) return "video/webm";
  return null;
}

function includesBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  outer: for (let index = 0; index <= bytes.length - signature.length; index += 1) {
    for (let offset = 0; offset < signature.length; offset += 1) {
      if (bytes[index + offset] !== signature[offset]) continue outer;
    }
    return true;
  }
  return false;
}

export function isAnimatedImage(bytes: Uint8Array, contentType: string): boolean {
  const buffer = Buffer.from(bytes);
  if (contentType === "image/gif") return true;
  if (contentType === "image/png") return buffer.indexOf(Buffer.from("acTL", "ascii")) >= 0;
  if (contentType === "image/webp") {
    const hasAnimationChunk = buffer.indexOf(Buffer.from("ANIM", "ascii")) >= 0;
    const animationFlag = bytes.length > 20
      && buffer.subarray(12, 16).toString("ascii") === "VP8X"
      && (bytes[20]! & 0x02) !== 0;
    return hasAnimationChunk || animationFlag;
  }
  return false;
}

export function detectMediaContentType(bytes: Uint8Array): string | null {
  const buffer = Buffer.from(bytes);
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("ascii");
  if (bytes.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";

  if (bytes.length >= 24 && ascii(4, 8) === "ftyp") {
    const firstBoxSize = buffer.readUInt32BE(0);
    const approvedBrands = new Set(["avc1", "dash", "iso2", "iso5", "iso6", "isom", "M4V ", "mp41", "mp42"]);
    const brand = ascii(8, 12);
    const firstBoxComplete = firstBoxSize >= 16 && firstBoxSize <= bytes.length;
    const nextBoxType = firstBoxComplete && firstBoxSize + 8 <= bytes.length
      ? ascii(firstBoxSize + 4, firstBoxSize + 8)
      : "";
    if (
      firstBoxComplete
      && approvedBrands.has(brand)
      && ["free", "mdat", "moov", "skip", "wide"].includes(nextBoxType)
    ) return "video/mp4";
  }

  const isEbml = bytes.length >= 4
    && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const hasWebmDocType = buffer.indexOf(Buffer.from("webm", "ascii")) >= 0;
  const hasSegment = includesBytes(bytes, [0x18, 0x53, 0x80, 0x67]);
  const hasTracksOrCluster = includesBytes(bytes, [0x16, 0x54, 0xae, 0x6b])
    || includesBytes(bytes, [0x1f, 0x43, 0xb6, 0x75]);
  if (isEbml && hasWebmDocType && hasSegment && hasTracksOrCluster) return "video/webm";

  return null;
}

export function parseMediaByteRange(
  range: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || start >= size
    || start > end
  ) return null;
  return { start, end };
}