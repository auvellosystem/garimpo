import { searchMercadoLivre, searchShopee, sortOffersForQuery } from "@/lib/integrations";

export const dynamic = "force-dynamic";

function optionalPrice(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; minPrice?: unknown; maxPrice?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 120) : "";
    const minPrice = optionalPrice(body.minPrice);
    const maxPrice = optionalPrice(body.maxPrice);

    if (query.length < 2) {
      return Response.json({ error: "Digite um produto para pesquisar." }, { status: 400 });
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return Response.json({ error: "O preço mínimo não pode ser maior que o preço máximo." }, { status: 400 });
    }

    const options = { minPrice, maxPrice };

    const [mercadoLivre, shopee] = await Promise.all([
      searchMercadoLivre(query, options),
      searchShopee(query, options),
    ]);

    const offers = sortOffersForQuery([...mercadoLivre.offers, ...shopee.offers], query, options, 20);

    return Response.json({
      query,
      filters: { minPrice, maxPrice },
      offers,
      sources: {
        mercadoLivre: { status: mercadoLivre.status, count: mercadoLivre.offers.length },
        shopee: { status: shopee.status, count: shopee.offers.length },
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível processar a consulta agora." }, { status: 500 });
  }
}
