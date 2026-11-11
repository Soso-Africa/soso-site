/** Read actual EBML Tracks, not a codec string found in arbitrary payload bytes. */
export function webmVideoCodec(bytes: Buffer): string | undefined {
  const vint = (offset: number, id: boolean) => {
    const first = bytes[offset];
    if (!first) throw new Error("Invalid EBML integer");
    let length = 1;
    while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
    if (length > (id ? 4 : 8) || offset + length > bytes.length) throw new Error("Truncated EBML integer");
    let value = id ? first : first & ((0x80 >> (length - 1)) - 1);
    let unknown = !id && value === ((0x80 >> (length - 1)) - 1);
    for (let i = 1; i < length; i++) {
      value = value * 256 + bytes[offset + i]!;
      unknown = unknown && bytes[offset + i] === 255;
    }
    return { value, length, unknown };
  };
  const containers = new Set([0x1a45dfa3, 0x18538067, 0x1654ae6b, 0xae]);
  const codecs: string[] = [];
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 4) throw new Error("Invalid EBML nesting");
    for (let offset = start; offset < end;) {
      const id = vint(offset, true);
      const size = vint(offset + id.length, false);
      const payload = offset + id.length + size.length;
      const next = size.unknown && id.value === 0x18538067 ? end : payload + size.value;
      if (!Number.isSafeInteger(next) || next > end || next < payload) throw new Error("Truncated WebM element");
      if (id.value === 0x86 && depth === 3) {
        const codec = bytes.toString("ascii", payload, next);
        if (codec.startsWith("V_")) codecs.push(codec);
      } else if (containers.has(id.value)) walk(payload, next, depth + 1);
      offset = next;
    }
  };
  try {
    if (bytes.readUInt32BE(0) !== 0x1a45dfa3) return undefined;
    walk(0, bytes.length, 0);
    return codecs.length === 1 ? codecs[0] : undefined;
  } catch {
    return undefined;
  }
}
