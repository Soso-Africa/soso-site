import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}
export const PASSWORD_MIN_LENGTH = 12;
export function validShopperPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= PASSWORD_MIN_LENGTH && value.length <= 128 && /\S/.test(value);
}
export async function hashShopperPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString("hex");
  const key = await deriveKey(password, salt);
  return `scrypt-v1$${salt}$${key.toString("hex")}`;
}
export async function checkShopperPassword(password: string, stored: string): Promise<boolean> {
  const [version, salt, hash] = stored.split("$");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{64}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const key = await deriveKey(password, salt);
  return timingSafeEqual(key, Buffer.from(hash, "hex"));
}
