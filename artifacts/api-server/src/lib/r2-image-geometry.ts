import { imageDimensions } from "./media-files";

/** Browser canvas and CSS honor EXIF orientation; validation must do so too. */
export function orientedImageDimensions(bytes: Buffer, contentType: string): { width: number; height: number } | null {
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions || contentType !== "image/jpeg") return dimensions;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = bytes.readUInt16BE(offset + 2);
    const end = offset + size + 2;
    if (size < 2 || end > bytes.length) break;
    if (marker === 0xe1 && bytes.subarray(offset + 4, offset + 10).equals(Buffer.from("Exif\0\0"))) {
      const base = offset + 10;
      if (base + 8 > end) break;
      const order = bytes.subarray(base, base + 2).toString("ascii");
      if (order !== "II" && order !== "MM") break;
      const u16 = (at: number) => order === "II" ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
      const u32 = (at: number) => order === "II" ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
      if (u16(base + 2) !== 42) break;
      const directory = base + u32(base + 4);
      if (directory < base + 8 || directory + 2 > end) break;
      const count = u16(directory);
      if (count > 256 || directory + 2 + 12 * count > end) break;
      for (let index = 0; index < count; index++) {
        const entry = directory + 2 + 12 * index;
        if (u16(entry) !== 0x0112 || u16(entry + 2) !== 3 || u32(entry + 4) !== 1) continue;
        const orientation = u16(entry + 8);
        return orientation >= 5 && orientation <= 8
          ? { width: dimensions.height, height: dimensions.width } : dimensions;
      }
    }
    offset = end;
  }
  return dimensions;
}
