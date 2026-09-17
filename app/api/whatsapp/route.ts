import { buildWhatsAppMessage, normalizeBrazilPhone, searchMercadoLivre, searchShopee, sendWhatsApp, sortOffersForQuery } from "@/lib/integrations";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS = 4;
const attempts = new Map<string, number[]>();

function allowed(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_SENDS) return false;
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

function optionalPrice(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; phone?: unknown; marketplace?: unknown; minPrice?: unknown; maxPrice?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const phone = normalizeBrazilPhone(rawPhone);
    const marketplace = body.marketplace === "Mercado Livre" || body.marketplace === "Shopee"
      ? body.marketplace
      : "all";
    const minPrice = optionalPrice(body.minPrice);
    const maxPrice = optionalPrice(body.maxPrice);
    const options = { minPrice, maxPrice };

    if (query.length < 2) {
      return Response.json({ error: "Faça uma pesquisa antes de enviar as ofertas." }, { status: 400 });
    }
    if (!/^55\d{10,11}$/.test(phone)) {
      return Response.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return Response.json({ error: "O preço mínimo não pode ser maior que o preço máximo." }, { status: 400 });
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowed(`${forwarded}:${phone}`)) {
      return Response.json({ error: "Limite de envios atingido. Tente novamente mais tarde." }, { status: 429 });
    }

    const offers = (marketplace === "Mercado Livre"
      ? (await searchMercadoLivre(query, options)).offers
      : marketplace === "Shopee"
        ? (await searchShopee(query, options)).offers
        : (await Promise.all([searchMercadoLivre(query, options), searchShopee(query, options)]))
          .flatMap((result) => result.offers));
    const selectedOffers = sortOffersForQuery(offers, query, options, 3);
    if (!selectedOffers.length) {
      return Response.json({ error: "Nenhuma oferta disponível para enviar agora." }, { status: 404 });
    }

    let sentCount = 0;
    for (const offer of selectedOffers) {
      const result = await sendWhatsApp(phone, buildWhatsAppMessage(query, [offer]));
      if (!result.sent) {
        const partial = sentCount ? ` ${sentCount} de ${selectedOffers.length} mensagens foram enviadas.` : "";
        return Response.json({ error: `${result.detail || "Não foi possível enviar pelo WhatsApp."}${partial}` }, { status: 502 });
      }
      sentCount += 1;
    }

    return Response.json({ sent: true, count: sentCount });
  } catch {
    return Response.json({ error: "Não foi possível enviar as ofertas agora." }, { status: 500 });
  }
}
