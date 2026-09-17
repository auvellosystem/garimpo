export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, service: "auvello-ofertas" }, {
    headers: { "cache-control": "no-store" },
  });
}
