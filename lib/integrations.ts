export type Offer = {
  id: string;
  marketplace: "Mercado Livre" | "Shopee" | "Amazon";
  title: string;
  price: number;
  originalPrice?: number;
  image?: string;
  url: string;
  shipping?: string;
  seller?: string;
  rating?: number;
  sold?: number;
};

let amazonTokenCache: { accessToken: string; expiresAt: number } | undefined;

export type ProviderResult = { offers: Offer[]; status: string };
export type ReferenceResult = ProviderResult & { query?: string };

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickBest(offers: Offer[], limit = 5): Offer[] {
  return offers
    .filter((offer) => offer.price > 0 && offer.url && offer.title)
    .sort((a, b) => {
      const aDiscount = a.originalPrice && a.originalPrice > a.price ? (a.originalPrice - a.price) / a.originalPrice : 0;
      const bDiscount = b.originalPrice && b.originalPrice > b.price ? (b.originalPrice - b.price) / b.originalPrice : 0;
      const aScore = a.price * (1 - Math.min(aDiscount, .55) * .18);
      const bScore = b.price * (1 - Math.min(bDiscount, .55) * .18);
      return aScore - bScore;
    })
    .slice(0, limit);
}

function mercadoLivreQueryVariants(query: string): string[] {
  const original = query.replace(/\s+/g, " ").trim();
  const withoutConnectors = original
    .split(" ")
    .filter((word) => !["a", "as", "o", "os", "de", "da", "das", "do", "dos", "para", "com"].includes(word.toLocaleLowerCase("pt-BR")))
    .join(" ");
  const variants = [original, withoutConnectors];
  const normalized = withoutConnectors.toLocaleLowerCase("pt-BR");
  const vehicleHint = /\b(fusca|gol|uno|palio|corsa|celta|onix|corolla|civic|saveiro|strada|hilux|carro|moto)\b/i;
  if (/\btapetes?\b/i.test(normalized) && vehicleHint.test(normalized)) {
    const vehicle = normalized.match(vehicleHint)?.[0] || "";
    variants.push(`tapete automotivo ${vehicle}`, `jogo tapetes ${vehicle}`);
  }
  return [...new Set(variants.map((value) => value.trim()).filter((value) => value.length >= 2))].slice(0, 4);
}

async function applyMercadoLivreAffiliateLinks(offers: Offer[]): Promise<{ offers: Offer[]; status: string }> {
  if (!offers.length) return { offers, status: "ok" };
  const mode = process.env.AFFILIATE_MODE?.trim().toLocaleLowerCase("pt-BR") || "portal";
  if (mode === "disabled") return { offers, status: "ok — afiliado desativado" };
  if (mode !== "portal") return { offers, status: `ok — AFFILIATE_MODE inválido (${mode})` };

  const tag = process.env.ML_AFFILIATE_TAG?.trim() || process.env.AFFILIATE_TAG?.trim();
  const cookie = process.env.ML_AFFILIATE_COOKIE?.trim();
  if (!tag || !cookie) return { offers, status: "ok — links normais; afiliado não configurado" };

  try {
    const response = await fetch(
      process.env.ML_AFFILIATE_CREATE_URL?.trim()
        || process.env.AFFILIATE_CREATE_URL?.trim()
        || "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/plain, */*",
          cookie,
          origin: "https://www.mercadolivre.com.br",
          referer: "https://www.mercadolivre.com.br/",
          "user-agent": process.env.ML_AFFILIATE_USER_AGENT?.trim() || "Mozilla/5.0",
        },
        body: JSON.stringify({ urls: offers.map((offer) => offer.url), tag }),
      },
    );
    if (!response.ok) return { offers, status: `ok — gerador afiliado recusou (${response.status})` };
    const payload = await response.json() as { urls?: Array<{ short_url?: unknown }> };
    const generated = Array.isArray(payload.urls) ? payload.urls : [];
    const linked = offers.map((offer, index) => {
      const shortUrl = typeof generated[index]?.short_url === "string" ? generated[index].short_url.trim() : "";
      return shortUrl ? { ...offer, url: shortUrl } : offer;
    });
    const converted = linked.filter((offer, index) => offer.url !== offers[index].url).length;
    return { offers: linked, status: converted === offers.length ? "ok" : `ok — ${converted}/${offers.length} links afiliados` };
  } catch {
    return { offers, status: "ok — gerador afiliado não respondeu" };
  }
}

export async function searchMercadoLivre(query: string): Promise<ProviderResult> {
  try {
    const token = await mercadoLivreAccessToken();
    if (!token) return { offers: [], status: "OAuth não autorizado — execute npm run ml:auth" };

    const responses = await Promise.all(mercadoLivreQueryVariants(query).map(async (variant) => {
      const endpoint = new URL("https://api.mercadolibre.com/products/search");
      endpoint.searchParams.set("site_id", "MLB");
      endpoint.searchParams.set("status", "active");
      endpoint.searchParams.set("q", variant);
      endpoint.searchParams.set("limit", "5");
      const response = await fetch(endpoint, { headers: mercadoLivreHeaders(token), signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return { ok: false as const, status: response.status, results: [] as Array<Record<string, any>> };
      const payload = await response.json() as { results?: Array<Record<string, any>> };
      return { ok: true as const, status: response.status, results: payload.results ?? [] };
    }));
    if (responses.every((response) => !response.ok)) {
      return { offers: [], status: `pesquisa indisponível (${responses[0]?.status || 500})` };
    }

    const productIds = [...new Set(responses.flatMap((response) => response.results)
      .map((product) => String(product.id ?? "").trim())
      .filter((id) => /^MLB\d+$/i.test(id))
    )].slice(0, 12);
    if (!productIds.length) return { offers: [], status: "nenhum produto de catálogo encontrado" };

    const resolved = await Promise.all(productIds.map((productId) =>
      resolveMercadoLivreProduct(productId, token, undefined, query),
    ));
    const offers = pickBest(resolved.flatMap((result) => result.offers), 10);
    if (!offers.length) return { offers: [], status: "nenhum anúncio ativo" };
    return applyMercadoLivreAffiliateLinks(offers);
  } catch { return { offers: [], status: "não respondeu" }; }
}

async function mercadoLivreAccessToken(): Promise<string | undefined> {
  const serviceUrl = process.env.MERCADO_LIVRE_TOKEN_SERVICE_URL?.trim() || "http://127.0.0.1:8788/token";
  try {
    const response = await fetch(serviceUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (response.ok) {
      const payload = await response.json() as { access_token?: unknown };
      const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
      if (token) return token;
    }
  } catch { /* Usa o token manual como fallback. */ }
  return process.env.MERCADO_LIVRE_ACCESS_TOKEN?.trim() || undefined;
}

function mercadoLivreHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

async function mercadoLivreRequest(path: string, accessToken?: string): Promise<Response> {
  return fetch(`https://api.mercadolibre.com${path}`, {
    headers: mercadoLivreHeaders(accessToken),
    signal: AbortSignal.timeout(12_000),
  });
}

function mercadoLivreItemUrl(itemId: string): string {
  return `https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/i, "MLB-")}`;
}

async function resolveMercadoLivreProduct(
  productId: string,
  token: string,
  seedOffer?: Offer,
  initialQuery = "",
): Promise<ReferenceResult> {
  try {
    let query = initialQuery;

    const productResponse = await mercadoLivreRequest(`/products/${productId}`, token);
    if (!productResponse.ok) {
      return { offers: seedOffer ? [seedOffer] : [], status: `catálogo indisponível (${productResponse.status})`, query };
    }
    const product = await productResponse.json() as Record<string, any>;
    query = String(product.name || query || "Produto do Mercado Livre").trim();
    const productImage = String(product.pictures?.[0]?.url || product.thumbnail || seedOffer?.image || "").replace(/^http:/, "https:");

    const itemsResponse = await mercadoLivreRequest(`/products/${productId}/items?status=active&limit=20`, token);
    if (!itemsResponse.ok) {
      return { offers: seedOffer ? [seedOffer] : [], status: `preços indisponíveis (${itemsResponse.status})`, query };
    }
    const itemsPayload = await itemsResponse.json() as Record<string, any>;
    const catalogItems = Array.isArray(itemsPayload.results) ? itemsPayload.results : Array.isArray(itemsPayload) ? itemsPayload : [];
    const itemIds = catalogItems
      .map((item: Record<string, any>) => String(item.item_id || item.id || ""))
      .filter(Boolean)
      .slice(0, 20);

    let offers: Offer[] = [];
    if (itemIds.length) {
      const detailsResponse = await mercadoLivreRequest(`/items?ids=${encodeURIComponent(itemIds.join(","))}&attributes=id,title,price,original_price,thumbnail,permalink,shipping,sold_quantity`, token);
      if (detailsResponse.ok) {
        const details = await detailsResponse.json() as Array<{ code?: number; body?: Record<string, any> }>;
        offers = details
          .filter((entry) => entry.code === 200 && entry.body)
          .map((entry): Offer => {
            const item = entry.body ?? {};
            return {
              id: String(item.id ?? ""), marketplace: "Mercado Livre", title: String(item.title || query),
              price: asNumber(item.price), originalPrice: asNumber(item.original_price) || undefined,
              image: String(item.thumbnail || productImage).replace(/^http:/, "https:"),
              url: String(item.permalink || mercadoLivreItemUrl(String(item.id ?? ""))),
              shipping: item.shipping?.free_shipping ? "Frete grátis" : undefined,
              sold: asNumber(item.sold_quantity) || undefined,
            };
          });
      }
    }

    if (!offers.length) {
      offers = catalogItems.map((item: Record<string, any>): Offer => {
        const id = String(item.item_id || item.id || "");
        return {
          id, marketplace: "Mercado Livre", title: query, price: asNumber(item.price), image: productImage,
          url: mercadoLivreItemUrl(id),
        };
      });
    }
    if (seedOffer && !offers.some((offer) => offer.id === seedOffer?.id)) offers.unshift(seedOffer);
    return { offers: pickBest(offers, 10), status: offers.length ? "ok" : "nenhum anúncio ativo", query };
  } catch {
    return { offers: [], status: "não respondeu" };
  }
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function searchShopee(query: string): Promise<ProviderResult> {
  const appId = process.env.SHOPEE_APP_ID?.trim();
  const secret = process.env.SHOPEE_SECRET?.trim();
  if (!appId || !secret) return { offers: [], status: "aguardando credenciais" };

  const graphQuery = `query ProductOffers($keyword: String!, $page: Int!, $limit: Int!) {
    productOfferV2(keyword: $keyword, page: $page, limit: $limit, listType: 0, sortType: 2) {
      nodes { itemId productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales ratingStar shopName }
      pageInfo { page limit hasNextPage }
    }
  }`;
  const body = JSON.stringify({ query: graphQuery, variables: { keyword: query, page: 1, limit: 20 } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha256Hex(`${appId}${timestamp}${body}${secret}`);

  try {
    const response = await fetch(process.env.SHOPEE_API_URL || "https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST", signal: AbortSignal.timeout(12_000),
      headers: { "content-type": "application/json", authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}` },
      body,
    });
    if (!response.ok) return { offers: [], status: `indisponível (${response.status})` };
    const payload = await response.json() as { data?: { productOfferV2?: { nodes?: Array<Record<string, any>> } }; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) return { offers: [], status: "credenciais ou consulta rejeitada" };
    const nodes = payload.data?.productOfferV2?.nodes ?? [];
    const offers = nodes.map((item): Offer => {
      const price = asNumber(item.priceMin);
      const discount = Math.max(0, Math.min(95, asNumber(item.priceDiscountRate)));
      const originalPrice = discount > 0 ? price / (1 - discount / 100) : undefined;
      return {
        id: String(item.itemId ?? ""), marketplace: "Shopee", title: String(item.productName ?? ""), price,
        originalPrice, image: String(item.imageUrl ?? ""), url: String(item.offerLink || item.productLink || ""),
        seller: item.shopName ? String(item.shopName) : undefined, rating: asNumber(item.ratingStar) || undefined,
        sold: asNumber(item.sales) || undefined,
      };
    });
    return { offers: pickBest(offers, 10), status: "ok" };
  } catch { return { offers: [], status: "não respondeu" }; }
}

function amazonTokenEndpoint(version: string): string {
  const configuredUrl = process.env.AMAZON_TOKEN_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (version === "3.2") return "https://api.amazon.co.uk/auth/o2/token";
  if (version === "3.3") return "https://api.amazon.co.jp/auth/o2/token";
  return "https://api.amazon.com/auth/o2/token";
}

type AmazonListing = {
  merchantInfo?: { name?: unknown };
  price?: {
    money?: { amount?: unknown };
    savingBasis?: { money?: { amount?: unknown } };
  };
};

type AmazonItem = {
  asin?: unknown;
  detailPageURL?: unknown;
  images?: { primary?: { large?: { url?: unknown }; medium?: { url?: unknown } } };
  itemInfo?: { title?: { displayValue?: unknown } };
  offersV2?: { listings?: AmazonListing[] };
};

type AmazonSearchPayload = {
  searchResult?: { items?: AmazonItem[] };
};

async function amazonAccessToken(clientId: string, clientSecret: string, version: string): Promise<string> {
  if (amazonTokenCache && amazonTokenCache.expiresAt > Date.now()) return amazonTokenCache.accessToken;

  const response = await fetch(amazonTokenEndpoint(version), {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "creatorsapi::default",
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = String(payload.error_description || payload.message || payload.error || `HTTP ${response.status}`);
    throw new Error(`autorização recusada: ${detail}`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) throw new Error("autorização não retornou access_token");
  const expiresIn = Math.max(60, asNumber(payload.expires_in) || 3600);
  amazonTokenCache = { accessToken, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 };
  return accessToken;
}

export async function searchAmazon(query: string): Promise<ProviderResult> {
  const clientId = process.env.AMAZON_CREATORS_CLIENT_ID?.trim();
  const clientSecret = process.env.AMAZON_CREATORS_CLIENT_SECRET?.trim();
  const credentialVersion = process.env.AMAZON_CREATORS_CREDENTIAL_VERSION?.trim() || "3.1";
  const partnerTag = process.env.AMAZON_PARTNER_TAG?.trim();
  const marketplace = process.env.AMAZON_MARKETPLACE?.trim() || "www.amazon.com.br";
  if (!clientId || !clientSecret || !partnerTag) return { offers: [], status: "aguardando credenciais" };

  try {
    const accessToken = await amazonAccessToken(clientId, clientSecret, credentialVersion);
    const baseUrl = (process.env.AMAZON_API_URL?.trim() || "https://creatorsapi.amazon/catalog/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/searchItems`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
        "x-marketplace": marketplace,
      },
      body: JSON.stringify({
        partnerTag,
        keywords: query,
        searchIndex: "All",
        itemCount: 10,
        marketplace,
        languagesOfPreference: ["pt_BR"],
        currencyOfPreference: "BRL",
        resources: [
          "images.primary.large",
          "images.primary.medium",
          "itemInfo.title",
          "itemInfo.byLineInfo",
          "offersV2.listings.availability",
          "offersV2.listings.merchantInfo",
          "offersV2.listings.price",
        ],
      }),
    });
    const payload = await response.json().catch(() => ({})) as AmazonSearchPayload;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return { offers: [], status: `acesso recusado (${response.status})` };
      return { offers: [], status: `indisponível (${response.status})` };
    }

    const items: AmazonItem[] = Array.isArray(payload.searchResult?.items) ? payload.searchResult.items : [];
    const offers = items.map((item): Offer | undefined => {
      const listings = Array.isArray(item.offersV2?.listings) ? item.offersV2.listings : [];
      const listing = listings.find((candidate) => asNumber(candidate.price?.money?.amount) > 0);
      const price = asNumber(listing?.price?.money?.amount);
      if (!listing || !price) return undefined;
      const originalPrice = asNumber(listing.price?.savingBasis?.money?.amount) || undefined;
      return {
        id: String(item.asin ?? ""),
        marketplace: "Amazon",
        title: String(item.itemInfo?.title?.displayValue ?? "Produto Amazon"),
        price,
        originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
        image: String(item.images?.primary?.large?.url || item.images?.primary?.medium?.url || ""),
        url: String(item.detailPageURL ?? ""),
        seller: listing.merchantInfo?.name ? String(listing.merchantInfo.name) : undefined,
      };
    }).filter((offer: Offer | undefined): offer is Offer => Boolean(offer));

    return { offers: pickBest(offers, 10), status: offers.length ? "ok" : "nenhuma oferta com preço" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "não respondeu";
    return { offers: [], status: message.startsWith("autorização") ? message : "não respondeu" };
  }
}

export function normalizeBrazilPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppMessage(query: string, offers: Offer[]): string {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const marketplaces: Offer["marketplace"][] = ["Mercado Livre", "Shopee", "Amazon"];
  const selected = marketplaces
    .flatMap((marketplace) => offers.filter((offer) => offer.marketplace === marketplace).slice(0, 3))
    .sort((a, b) => a.price - b.price);
  const lines = selected.flatMap((offer, index) => [
    `*${index + 1}. ${offer.title.slice(0, 100)}*`,
    `${offer.marketplace} • ${currency.format(offer.price)}${offer.shipping ? ` • ${offer.shipping}` : ""}`,
    offer.url,
    "",
  ]);
  return [`🔎 *Melhores ofertas para: ${query}*`, "", ...lines, "Preços e disponibilidade podem mudar. Confira na loja antes de comprar."].join("\n").slice(0, 4000);
}

export async function sendWhatsApp(phoneInput: string, message: string) {
  const phone = normalizeBrazilPhone(phoneInput);
  if (!phone) return { sent: false, mode: "none" as const };
  const manualUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  const auvelloUrl = process.env.AUVELLO_CLOUD_URL?.trim().replace(/\/$/, "");
  const auvelloSecret = process.env.AUVELLO_WHATSAPP_SECRET?.trim();
  if (auvelloUrl && auvelloSecret) {
    try {
      const response = await fetch(`${auvelloUrl}/send/direct`, {
        method: "POST",
        signal: AbortSignal.timeout(75_000),
        headers: {
          "content-type": "application/json",
          "x-auvello-key": auvelloSecret,
        },
        body: JSON.stringify({ phone, message }),
      });
      if (response.ok) return { sent: true, mode: "automatic" as const };
      const payload = await response.json().catch(() => ({})) as { error?: string };
      return {
        sent: false,
        mode: "manual" as const,
        url: manualUrl,
        detail: payload.error || `Auvello Cloud recusou o envio (${response.status})`,
      };
    } catch {
      return { sent: false, mode: "manual" as const, url: manualUrl, detail: "Auvello Cloud não respondeu" };
    }
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return { sent: false, mode: "manual" as const, url: manualUrl, detail: "Envio automático não configurado" };

  try {
    const version = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST", signal: AbortSignal.timeout(12_000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { preview_url: true, body: message } }),
    });
    if (response.ok) return { sent: true, mode: "automatic" as const };
    return { sent: false, mode: "manual" as const, url: manualUrl, detail: `WhatsApp recusou o envio (${response.status})` };
  } catch { return { sent: false, mode: "manual" as const, url: manualUrl, detail: "WhatsApp não respondeu" }; }
}
