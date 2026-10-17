// This module has no application credentials, public-bucket binding, or deletion.
export const RUN_BYTES = 100_000_000;
export const TOTAL_BYTES = 1_000_000_000;
export const RECORD_RESERVE = 32_768;
export const MAX_FILES = 16;
const hex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
export const normalizeEtag = value => String(value ?? "").replace(/^"|"$/g, "");
export const checkpointKey = prefix => `${prefix}/checkpoint.json`;
export const recordKey = (prefix, key, etag) => `${prefix}/records/${encodeURIComponent(key)}/${etag}.json`;
export const dataKey = (prefix, key, etag) => `${prefix}/originals/${encodeURIComponent(key)}/${etag}`;

export function validateJob(job, namespace = "") {
  const key = namespace ? job.key.slice(namespace.length + 1) : job.key;
  if ((namespace && !job.key.startsWith(`${namespace}/`))
    || !/^(uploads|public)\/[A-Za-z0-9_./-]+\.(jpg|png|webp|gif|mp4|webm)$/.test(key)
    || key.includes("..") || key.includes("//") || !/^[a-f0-9]{32}$/.test(job.etag)
    || !Number.isSafeInteger(job.size) || job.size < 1 || job.size > 64 * 1024 * 1024) {
    throw new Error("Invalid immutable backup identity");
  }
}

export async function streamDigest(body) {
  const digest = new crypto.DigestStream("SHA-256");
  await body.pipeTo(digest);
  return hex(await digest.digest);
}

export async function copyOriginal(env, job) {
  validateJob(job, env.SOURCE_NAMESPACE || "");
  const prefix = env.BACKUP_PREFIX;
  if (!/^r2-runtime\/v1(?:-test-[a-f0-9]+)?$/.test(prefix)) throw new Error("Invalid backup scope");
  const recoveryKey = recordKey(prefix, job.key, job.etag);
  const destination = dataKey(prefix, job.key, job.etag);
  const previous = await env.BACKUP.get(recoveryKey);
  if (previous) {
    const record = await previous.json();
    if (record.sourceKey !== job.key || record.sourceEtag !== job.etag || record.size !== job.size
      || record.backupKey !== destination || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      throw new Error("Conflicting immutable recovery record");
    }
    const saved = await env.BACKUP.get(destination);
    if (!saved?.body || saved.size !== job.size || normalizeEtag(saved.etag) !== job.etag
      || await streamDigest(saved.body) !== record.sha256) throw new Error("Backup retry read-back failed");
    return { recoveryKey, sha256: record.sha256, size: job.size, resumed: true };
  }
  const source = await env.SOURCE.get(job.key, { onlyIf: { etagMatches: job.etag } });
  if (!source?.body || source.size !== job.size || normalizeEtag(source.etag) !== job.etag) {
    throw new Error("Source changed before backup");
  }
  const existing = await env.BACKUP.head(destination);
  const [copy, digest] = source.body.tee();
  // Native streams avoid keeping an entire photograph/video in Worker memory.
  // R2 also validates its source MD5 while accepting the streaming copy.
  const tasks = await Promise.allSettled([
    streamDigest(digest),
    existing ? copy.cancel() : env.BACKUP.put(destination, copy, {
      onlyIf: { etagDoesNotMatch: "*" }, md5: source.checksums?.md5 || job.etag,
      httpMetadata: source.httpMetadata,
      customMetadata: { "soso-backup": "original", "source-etag": job.etag },
    }),
  ]);
  const failed = tasks.find(result => result.status === "rejected");
  if (failed) throw failed.reason;
  const sha256 = tasks[0].value;
  const saved = await env.BACKUP.get(destination);
  if (!saved?.body || saved.size !== job.size || normalizeEtag(saved.etag) !== job.etag
    || await streamDigest(saved.body) !== sha256) throw new Error("Backup complete read-back failed");
  const record = {
    version: 1, sourceKey: job.key, sourceEtag: job.etag, size: job.size, backupKey: destination, sha256,
    sourceUploadedAt: source.uploaded?.toISOString(), verifiedAt: new Date().toISOString(),
    httpMetadata: source.httpMetadata, customMetadata: source.customMetadata,
  };
  if (JSON.stringify(record).length > RECORD_RESERVE / 2) throw new Error("Recovery metadata exceeds its reserved budget");
  await env.BACKUP.put(recoveryKey, JSON.stringify(record), {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" },
  });
  return { recoveryKey, sha256, size: job.size, resumed: false };
}

export async function listOriginals(env) {
  const objects = [];
  const namespace = env.SOURCE_NAMESPACE ? `${env.SOURCE_NAMESPACE}/` : "";
  for (const area of ["uploads/", "public/"]) {
    let cursor;
    for (let page = 0; page < 8; page++) {
      const result = await env.SOURCE.list({ prefix: namespace + area, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const object of result.objects) {
        if (!/\.(jpg|png|webp|gif|mp4|webm)$/.test(object.key)
          || object.key.includes("/_soso_ops_private_")) continue;
        const job = { key: object.key, etag: normalizeEtag(object.etag), size: object.size };
        validateJob(job, env.SOURCE_NAMESPACE || "");
        objects.push(job);
      }
      if (!result.truncated) break;
      if (!result.cursor || result.cursor === cursor || page === 7) throw new Error("Original inventory exceeded its bounded page budget");
      cursor = result.cursor;
    }
  }
  return objects;
}

export async function runBackup(env, now = Date.now()) {
  const key = checkpointKey(env.BACKUP_PREFIX);
  const object = await env.BACKUP.get(key);
  if (!object) throw new Error("Verified independent-backup baseline must be seeded before automation");
  const state = await object.json();
  if (state.version !== 1 || !state.known || !state.reservations || state.prefix !== env.BACKUP_PREFIX
    || !Number.isSafeInteger(state.reservedBytes) || state.reservedBytes < 0) throw new Error("Invalid backup checkpoint");
  if (state.leaseUntil && Date.parse(state.leaseUntil) > now) throw new Error("Another daily backup owns the lease");
  state.leaseUntil = new Date(now + 20 * 60_000).toISOString();
  state.lastAttemptAt = new Date(now).toISOString();
  state.status = "running";
  const claimed = await env.BACKUP.put(key, JSON.stringify(state), { onlyIf: { etagMatches: object.etag } });
  if (!claimed) throw new Error("Backup checkpoint changed before lease acquisition");
  let checkpointEtag = claimed.etag;
  const save = async () => {
    const result = await env.BACKUP.put(key, JSON.stringify(state), { onlyIf: { etagMatches: checkpointEtag } });
    if (!result) throw new Error("Backup checkpoint lease was replaced");
    checkpointEtag = result.etag;
  };
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.day !== day) { state.day = day; state.attemptedBytes = 0; }
  state.failures = [];
  try {
    const pending = (await listOriginals(env)).filter(job => state.known[job.key]?.etag !== job.etag);
    state.pending = pending.length;
    let copied = 0;
    for (const job of pending) {
      const identity = `${job.key}:${job.etag}`;
      const reserve = state.reservations[identity] ? 0 : job.size + RECORD_RESERVE;
      if (copied >= MAX_FILES || state.attemptedBytes + job.size > RUN_BYTES || state.reservedBytes + reserve > TOTAL_BYTES) {
        state.failures.push("A daily work or storage limit was reached. Pending files remain unverified; review the limits before increasing them.");
        break;
      }
      state.attemptedBytes += job.size;
      state.reservedBytes += reserve;
      state.reservations[identity] = true;
      await save(); // Reserve BEFORE copying; retries cannot bypass the storage/daily limits.
      try {
        const result = await env.EXECUTOR.copy(job);
        state.known[job.key] = { etag: job.etag, size: job.size, recoveryKey: result.recoveryKey };
        state.pending--;
        copied++;
      } catch {
        state.failures.push("An original failed complete checksum/read-back verification. The next daily run will retry it.");
        // Stop this bounded run instead of repeatedly exhausting a broken dependency.
        break;
      }
      await save();
    }
    state.status = state.pending ? "warning" : "healthy";
    if (!state.pending) state.lastSuccessAt = new Date().toISOString();
  } catch {
    state.status = "failed";
    state.failures.push("The daily backup could not finish. Check Worker invocation errors and the private backup checkpoint.");
  } finally {
    state.finishedAt = new Date().toISOString();
    state.leaseUntil = null;
    await save();
  }
  return backupView(state);
}

export function backupView(state) {
  return {
    status: state.status, lastAttemptAt: state.lastAttemptAt || null, lastSuccessAt: state.lastSuccessAt || null,
    pending: state.pending ?? null, reservedBytes: state.reservedBytes,
    dailyByteLimit: RUN_BYTES, totalByteLimit: TOTAL_BYTES, attemptedBytes: state.attemptedBytes || 0,
    messages: (state.failures || []).slice(0, 3),
  };
}
