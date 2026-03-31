import { createHash, timingSafeEqual } from "crypto";

function expectedKey(): string {
  return (
    process.env.DEMO_ACCESS_KEY ||
    (process.env.NODE_ENV === "development" ? "bir-demo" : "")
  ).trim();
}

/**
 * Constant-time compare of passphrase SHA-256 digests (avoid raw timing leak on string compare).
 */
export function isValidDemoPassphrase(submitted: string): boolean {
  const expected = expectedKey();
  const attempt = submitted.trim();
  if (!expected || !attempt) return false;
  const a = createHash("sha256").update(attempt, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

export function demoPassphraseConfigured(): boolean {
  return Boolean(expectedKey());
}
