import { createServer } from "node:http";
import { getValidAccessToken, loadLocalEnv } from "./ml-oauth-common.mjs";

await loadLocalEnv();
const port = Number(process.env.ML_TOKEN_SERVICE_PORT || 8788);
let refreshInProgress = null;

async function token() {
  if (!refreshInProgress) {
    refreshInProgress = getValidAccessToken().finally(() => { refreshInProgress = null; });
  }
  return refreshInProgress;
}

const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  if (request.method !== "GET" || !["/token", "/health"].includes(request.url || "")) {
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (request.url === "/health") {
    response.writeHead(200).end(JSON.stringify({ ok: true }));
    return;
  }
  try {
    const accessToken = await token();
    response.writeHead(200).end(JSON.stringify({ access_token: accessToken }));
  } catch (error) {
    response.writeHead(503).end(JSON.stringify({ error: error instanceof Error ? error.message : "OAuth indisponível" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[Mercado Livre OAuth] serviço local ativo na porta ${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
