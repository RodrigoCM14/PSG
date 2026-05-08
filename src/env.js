import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function loadLocalEnv(root) {
  for (const filename of [".env", ".env.local"]) {
    await loadEnvFile(join(root, filename));
  }
}

async function loadEnvFile(filePath) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = unquote(trimmed.slice(separator + 1).trim());
    if (!process.env[key]) process.env[key] = value;
  }
}

function unquote(value) {
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}
