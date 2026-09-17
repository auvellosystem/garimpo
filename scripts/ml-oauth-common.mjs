import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const envPath = resolve(projectRoot, ".env.local");
const tokenPath = resolve(projectRoot, ".mercado-livre-token.json");
const tokenEndpoint = "https://api.mercadolibre.com/oauth/token";

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const separator = trimmed.indexOf("=");
  if (separator < 1) return;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = value;
}

export async function loadLocalEnv() {
  if (!existsSync(envPath)) return;
  const content = await readFile(envPath, "utf8");
  content.split(/\r?\n/).forEach(parseEnvLine);
}

export function oauthConfig() {
  return {
    clientId: process.env.ML_CLIENT_ID?.trim() || "",
    clientSecret: process.env.ML_CLIENT_SECRET?.trim() || "",
    redirectUri: process.env.ML_REDIRECT_URI?.trim() || "",
  };
}

export function validateOauthConfig() {
  const config = oauthConfig();
  const missing = [];
  if (!config.clientId) missing.push("ML_CLIENT_ID");
  if (!config.clientSecret) missing.push("ML_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("ML_REDIRECT_URI");
  if (missing.length) throw new Error(`Preencha ${missing.join(", ")} no arquivo .env.local.`);
  return config;
}

export function createPkcePair() {
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function createState() {
  return randomBytes(24).toString("base64url");
}

export async function loadTokens() {
  if (!existsSync(tokenPath)) return null;
  try {
    return JSON.parse(await readFile(tokenPath, "utf8"));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens) {
  const payload = {
    ...tokens,
    expires_at: Date.now() + Math.max(0, Number(tokens.expires_in || 0) - 60) * 1000,
  };
  const temporaryPath = `${tokenPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, tokenPath);
  try { await chmod(tokenPath, 0o600); } catch { /* Windows controla as permissões da pasta. */ }
  return payload;
}

async function tokenRequest(parameters) {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.message || payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Mercado Livre recusou a autorização: ${detail}`);
  }
  return payload;
}

export async function exchangeAuthorizationCode(code, verifier) {
  const config = validateOauthConfig();
  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });
  return saveTokens(tokens);
}

export async function refreshAccessToken(refreshToken) {
  const config = validateOauthConfig();
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
  return saveTokens(tokens);
}

export async function getValidAccessToken() {
  const tokens = await loadTokens();
  if (!tokens?.access_token) throw new Error("OAuth ainda não autorizado. Execute npm run ml:auth.");
  if (Number(tokens.expires_at || 0) > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Token expirado e sem refresh_token. Execute npm run ml:auth novamente.");
  const refreshed = await refreshAccessToken(tokens.refresh_token);
  if (!refreshed.access_token) throw new Error("O Mercado Livre não retornou um novo access_token.");
  return refreshed.access_token;
}

export { projectRoot, tokenPath };
