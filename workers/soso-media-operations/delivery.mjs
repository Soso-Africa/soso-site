const mime = path => path.endsWith(".png") ? "image/png" : "image/jpeg";
const sha = async text => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");

export function photoReferences(document) {
  const refs = new Map();
  const visit = value => {
    if (typeof value === "string") {
      for (const m of value.matchAll(/(?:^|[\s"'<>(])\/api\/storage\/(objects|public-objects)\/([A-Za-z0-9_./-]+\.(?:jpg|png))(?=$|[\s"'<>?#)\],])/g)) {
        if (!m[2].includes("..")) refs.set(`${m[1]}/${m[2]}`, { area: m[1] === "objects" ? "uploads" : "public", path: m[2] });
      }
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(document);
  return [...refs.values()];
}

export async function checkDelivery(env, request = fetch) {
  const site = "https://shopsoso.co";
  const origin = "https://media.shopsoso.co";
  const http = async (url, options = {}) => request(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), ...options });
  const result = { status: "failed", checkedAt: new Date().toISOString(), checkedCases: 0, privateDenial: false, message: null };
  try {
    const response = await http(`${site}/api/content/platform`);
    if (response.status !== 200) throw new Error("Published storefront content is unavailable");
    // Bounded response even when the public endpoint omits Content-Length.
    const reader = response.body.getReader();
    let received = 0;
    const parts = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 2_000_000) { await reader.cancel(); throw new Error("Published content exceeded the monitoring budget"); }
      parts.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const refs = photoReferences(JSON.parse(new TextDecoder().decode(bytes)));
    const samples = [refs.find(r => r.path.endsWith(".jpg")), refs.find(r => r.path.endsWith(".png"))].filter(Boolean);
    if (!samples.length) throw new Error("No current approved photo sample is available");
    for (const reference of samples) {
      const base = `/api/storage/${reference.area === "uploads" ? "objects" : "public-objects"}/${reference.path}`;
      const originalKey = `${reference.area === "public" ? "public/" : ""}${reference.path}`;
      const source = await env.SOURCE.head(originalKey);
      if (!source?.size) throw new Error("Approved photo source metadata is unavailable");
      const identity = await sha(`${reference.area}/${reference.path}`);
      const extension = reference.path.endsWith(".png") ? "png" : "jpg";
      const manifestObject = await env.SOURCE.get(`renditions/${identity}/manifest.json`);
      if (!manifestObject) throw new Error("Approved responsive manifest is unavailable");
      const manifest = await manifestObject.json();
      for (const width of [null, 480, 1600]) {
        const expected = width ? manifest.renditions?.find(r => r.width === width) : { key: originalKey, size: source.size };
        if (!expected?.size) throw new Error("An approved responsive size is missing");
        const expectedKey = width ? `renditions/${identity}/${width}.${extension}` : originalKey;
        if (expected.key !== expectedKey) throw new Error("Responsive metadata does not identify the expected source");
        const managed = await http(site + base + (width ? `?w=${width}` : ""), { method: "HEAD" });
        if (managed.status !== 302 || managed.headers.get("location") !== `${origin}/${expectedKey}`) {
          throw new Error("A persisted storefront photo path no longer resolves to the approved media domain");
        }
        const delivered = await http(`${origin}/${expectedKey}`, { method: "HEAD" });
        if (delivered.status !== 200 || delivered.headers.get("content-type")?.split(";")[0] !== mime(reference.path)
          || Number(delivered.headers.get("content-length")) !== expected.size) {
          throw new Error("Photo domain, access, MIME or size check failed");
        }
        result.checkedCases++;
        if (result.checkedCases === 1) {
          const range = await http(`${origin}/${expectedKey}`, { headers: { Range: "bytes=0-7" } });
          if (range.status !== 206 || range.headers.get("content-range") !== `bytes 0-7/${expected.size}`) {
            await range.body?.cancel();
            throw new Error("Photo byte-range delivery failed");
          }
          const rangeBytes = await range.arrayBuffer();
          if (rangeBytes.byteLength !== 8) throw new Error("Photo range length changed");
        }
      }
    }
    // Persistent synthetic private pixel: no product bytes or draft selection heuristic.
    const privateKey = env.PRIVACY_CANARY_KEY;
    if (!/^uploads\/_soso_ops_private_[a-f0-9]+\.png$/.test(privateKey || "")
      || !await env.SOURCE.head(privateKey)) throw new Error("Private-boundary canary is unavailable");
    const [managed, direct] = await Promise.all([
      http(`${site}/api/storage/objects/${privateKey}`, { method: "HEAD" }),
      http(`${origin}/${privateKey}`, { method: "HEAD" }),
    ]);
    if (managed.status !== 404 || direct.status !== 404) throw new Error("A known private object is anonymously accessible");
    result.privateDenial = true;
    result.status = "healthy";
  } catch (error) {
    result.message = error instanceof Error ? error.message : "Media delivery could not be verified";
  }
  return result;
}
