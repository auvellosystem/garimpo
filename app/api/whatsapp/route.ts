import { buildWhatsAppMessage, normalizeBrazilPhone, searchMercadoLivre, searchShopee, sendWhatsApp } from "@/lib/integrations";

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

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; phone?: unknown; marketplace?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const phone = normalizeBrazilPhone(rawPhone);
    const marketplace = body.marketplace === "Mercado Livre" || body.marketplace === "Shopee"
      ? body.marketplace
      : "all";

    if (query.length < 2) {
      return Response.json({ error: "Faça uma pesquisa antes de enviar as ofertas." }, { status: 400 });
    }
    if (!/^55\d{10,11}$/.test(phone)) {
      return Response.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowed(`${forwarded}:${phone}`)) {
      return Response.json({ error: "Limite de envios atingido. Tente novamente mais tarde." }, { status: 429 });
    }

    const offers = (marketplace === "Mercado Livre"
      ? (await searchMercadoLivre(query)).offers
      : marketplace === "Shopee"
        ? (await searchShopee(query)).offers
        : (await Promise.all([searchMercadoLivre(query), searchShopee(query)]))
          .flatMap((result) => result.offers))
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
    if (!offers.length) {
      return Response.json({ error: "Nenhuma oferta disponível para enviar agora." }, { status: 404 });
    }

    let sentCount = 0;
    for (const offer of offers) {
      const result = await sendWhatsApp(phone, buildWhatsAppMessage(query, [offer]));
      if (!result.sent) {
        const partial = sentCount ? ` ${sentCount} de ${offers.length} mensagens foram enviadas.` : "";
        return Response.json({ error: `${result.detail || "Não foi possível enviar pelo WhatsApp."}${partial}` }, { status: 502 });
      }
      sentCount += 1;
    }

    return Response.json({ sent: true, count: sentCount });
  } catch {
    return Response.json({ error: "Não foi possível enviar as ofertas agora." }, { status: 500 });
  }
}
