import { searchAmazon, searchMercadoLivre, searchShopee } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";

    if (query.length < 2) {
      return Response.json({ error: "Digite um produto para pesquisar." }, { status: 400 });
    }

    const [mercadoLivre, shopee, amazon] = await Promise.all([
      searchMercadoLivre(query),
      searchShopee(query),
      searchAmazon(query),
    ]);

    const offers = [...mercadoLivre.offers, ...shopee.offers, ...amazon.offers]
      .sort((a, b) => a.price - b.price)
      .slice(0, 30);

    return Response.json({
      query,
      offers,
      sources: {
        mercadoLivre: { status: mercadoLivre.status, count: mercadoLivre.offers.length },
        shopee: { status: shopee.status, count: shopee.offers.length },
        amazon: { status: amazon.status, count: amazon.offers.length },
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível processar a consulta agora." }, { status: 500 });
  }
}
