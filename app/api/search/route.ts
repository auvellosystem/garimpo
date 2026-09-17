import { buildWhatsAppMessage, searchAmazon, searchMercadoLivre, searchMercadoLivreByReference, searchShopee, sendWhatsApp, type ProviderResult } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; reference?: unknown; mode?: unknown; phone?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 500) : "";
    const mode = body.mode === "mercado_link" ? "mercado_link" : "name";
    const phone = typeof body.phone === "string" ? body.phone : "";
    if (mode === "name" && query.length < 2) return Response.json({ error: "Digite um produto para pesquisar." }, { status: 400 });
    if (mode === "mercado_link" && reference.length < 6) return Response.json({ error: "Cole um link ou ID válido do Mercado Livre." }, { status: 400 });

    let mercadoLivre: ProviderResult;
    let shopee: ProviderResult;
    let amazon: ProviderResult;
    let resolvedQuery = query;

    if (mode === "mercado_link") {
      const referenceResult = await searchMercadoLivreByReference(reference);
      mercadoLivre = referenceResult;
      resolvedQuery = referenceResult.query || "Produto do Mercado Livre";
      if (referenceResult.query) {
        [shopee, amazon] = await Promise.all([
          searchShopee(referenceResult.query),
          searchAmazon(referenceResult.query),
        ]);
      } else {
        shopee = { offers: [], status: "aguardando identificação do produto" };
        amazon = { offers: [], status: "aguardando identificação do produto" };
      }
    } else {
      [mercadoLivre, shopee, amazon] = await Promise.all([
        searchMercadoLivre(query),
        searchShopee(query),
        searchAmazon(query),
      ]);
    }

    const offers = [...mercadoLivre.offers, ...shopee.offers, ...amazon.offers]
      .sort((a, b) => a.price - b.price)
      .slice(0, 30);
    const message = buildWhatsAppMessage(resolvedQuery, offers);
    const whatsapp = offers.length ? await sendWhatsApp(phone, message) : { sent: false, mode: "none" as const };

    return Response.json({
      query: resolvedQuery,
      mode,
      offers,
      sources: {
        mercadoLivre: { status: mercadoLivre.status, count: mercadoLivre.offers.length },
        shopee: { status: shopee.status, count: shopee.offers.length },
        amazon: { status: amazon.status, count: amazon.offers.length },
      },
      whatsapp,
    });
  } catch {
    return Response.json({ error: "Não foi possível processar a consulta agora." }, { status: 500 });
  }
}
