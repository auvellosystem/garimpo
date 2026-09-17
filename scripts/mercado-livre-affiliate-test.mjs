import { loadLocalEnv } from "./ml-oauth-common.mjs";

await loadLocalEnv();

const originUrl = process.argv[2]?.trim();
if (!originUrl || !/^https:\/\//i.test(originUrl)) {
  throw new Error('Informe um link do Mercado Livre. Exemplo: npm run ml:affiliate:test -- "https://www.mercadolivre.com.br/p/MLB..."');
}

const mode = process.env.AFFILIATE_MODE?.trim().toLowerCase() || "portal";
if (mode !== "portal") throw new Error(`AFFILIATE_MODE deve ser "portal" para este teste; recebido: ${mode}`);
const tag = process.env.ML_AFFILIATE_TAG?.trim() || process.env.AFFILIATE_TAG?.trim();
const cookie = process.env.ML_AFFILIATE_COOKIE?.trim();
if (!tag) throw new Error("Preencha AFFILIATE_TAG no .env.local.");
if (!cookie) throw new Error("Preencha ML_AFFILIATE_COOKIE no .env.local.");

const endpoint = process.env.ML_AFFILIATE_CREATE_URL?.trim()
  || process.env.AFFILIATE_CREATE_URL?.trim()
  || "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink";
const response = await fetch(endpoint, {
  method: "POST",
  signal: AbortSignal.timeout(20_000),
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/plain, */*",
    cookie,
    origin: "https://www.mercadolivre.com.br",
    referer: "https://www.mercadolivre.com.br/",
    "user-agent": process.env.ML_AFFILIATE_USER_AGENT?.trim() || "Mozilla/5.0",
  },
  body: JSON.stringify({ urls: [originUrl], tag }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Gerador de afiliados HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 400)}`);
const shortUrl = payload?.urls?.[0]?.short_url;
if (!shortUrl) throw new Error(`O gerador respondeu sem short_url: ${JSON.stringify(payload).slice(0, 400)}`);
console.log(`\nLink afiliado gerado com sucesso:\n${shortUrl}\n`);
