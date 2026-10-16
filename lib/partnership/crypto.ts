import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/** AES-256-GCM for secrets stored in the partnership DB (Google refresh token). Key: PARTNER_ENC_KEY. */
function key(): Buffer {
  const k = process.env.PARTNER_ENC_KEY;
  if (!k || k.length < 32) throw new Error("PARTNER_ENC_KEY belum diset");
  return createHash("sha256").update(k).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

export function open(sealed: string): string {
  const [iv, tag, data] = sealed.split(":");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "hex"));
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(data, "hex")), d.final()]).toString("utf8");
}
