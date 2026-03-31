import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parse n8n/local-secrets.env (KEY=value, # comments). File is gitignored.
 * @returns {Record<string, string>}
 */
export function loadLocalSecrets() {
  const p = path.join(__dirname, "local-secrets.env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/**
 * Use env value if non-empty; otherwise placeholder for export JSON.
 */
export function pick(local, key, placeholder) {
  const v = String(local[key] ?? "").trim();
  return v || placeholder;
}
