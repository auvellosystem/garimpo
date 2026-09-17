import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createPkcePair,
  createState,
  exchangeAuthorizationCode,
  loadLocalEnv,
  oauthConfig,
  validateOauthConfig,
} from "./ml-oauth-common.mjs";

function openBrowser(url) {
  const commands = process.platform === "win32"
    ? [["rundll32", ["url.dll,FileProtocolHandler", url]]]
    : process.platform === "darwin"
      ? [["open", [url]]]
      : [["xdg-open", [url]]];
  const [command, args] = commands[0];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } catch { /* A URL também é impressa para abertura manual. */ }
}

function extractCode(value, expectedState) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const returnedState = url.searchParams.get("state");
    if (returnedState && returnedState !== expectedState) throw new Error("O state retornado não corresponde a esta autorização.");
    return url.searchParams.get("code")?.trim() || "";
  } catch (error) {
    if (error instanceof Error && error.message.includes("state")) throw error;
    return trimmed;
  }
}

await loadLocalEnv();
const config = validateOauthConfig();
const { verifier, challenge } = createPkcePair();
const state = createState();
const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
authorizationUrl.searchParams.set("response_type", "code");
authorizationUrl.searchParams.set("client_id", config.clientId);
authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
authorizationUrl.searchParams.set("code_challenge", challenge);
authorizationUrl.searchParams.set("code_challenge_method", "S256");
authorizationUrl.searchParams.set("state", state);

console.log("\nAbrindo a autorização do Mercado Livre...\n");
console.log(authorizationUrl.toString());
console.log("\nAutorize a aplicação. No final, copie a URL completa exibida na barra do navegador.");
console.log(`A URI cadastrada atualmente é: ${oauthConfig().redirectUri}\n`);
openBrowser(authorizationUrl.toString());

const reader = createInterface({ input, output });
try {
  const returned = await reader.question("Cole a URL completa (ou somente o parâmetro code) e pressione Enter:\n> ");
  const code = extractCode(returned, state);
  if (!code) throw new Error("Nenhum code de autorização foi encontrado.");
  const tokens = await exchangeAuthorizationCode(code, verifier);
  console.log("\nMercado Livre autorizado com sucesso.");
  console.log(`Token válido por aproximadamente ${Math.round(Number(tokens.expires_in || 0) / 60)} minutos.`);
  console.log(process.env.DATABASE_URL?.trim()
    ? "Tokens salvos no Neon. O Render poderá renová-los automaticamente.\n"
    : "A renovação será feita automaticamente enquanto o projeto estiver rodando.\n");
} finally {
  reader.close();
}
