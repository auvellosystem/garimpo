"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, LoaderCircle, MessageCircle, Search, Send, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Offer = { id: string; marketplace: "Mercado Livre" | "Shopee"; title: string; price: number; originalPrice?: number; image?: string; url: string; shipping?: string; seller?: string; rating?: number; sold?: number };
type SourceSummary = { status: string; count: number };
type SearchResponse = { query: string; offers: Offer[]; sources: { mercadoLivre: SourceSummary; shopee: SourceSummary } };
type MarketplaceFilter = "all" | "Mercado Livre" | "Shopee";
type WhatsAppMarketplace = "all" | "Mercado Livre" | "Shopee";
type WhatsAppStep = "ask" | "marketplace" | "phone" | "sent";

declare global { interface Document { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } } }

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Home() {
  const [query, setQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceFilter>("all");
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappStep, setWhatsappStep] = useState<WhatsAppStep>("ask");
  const [whatsappMarketplace, setWhatsappMarketplace] = useState<WhatsAppMarketplace>("all");
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappSent, setWhatsappSent] = useState(false);

  const runSearch = useCallback(async (product: string) => {
    const cleanedProduct = product.trim();
    if (cleanedProduct.length < 2) throw new Error("Digite o nome do produto que você quer encontrar.");
    setLoading(true);
    setError("");
    setData(null);
    setMarketplaceFilter("all");
    setWhatsappSent(false);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: cleanedProduct }),
      });
      const body = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar as ofertas.");
      setData(body);
      if (body.offers.length) {
        setWhatsappStep("ask");
        setWhatsappMarketplace("all");
        setWhatsappError("");
        setWhatsappOpen(true);
      }
      return { count: body.offers.length };
    } finally {
      setLoading(false);
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await runSearch(query); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado."); }
  }

  async function sendOffers() {
    if (!data) return;
    const cleanedPhone = phone.replace(/\D/g, "");
    if (cleanedPhone.length < 10) {
      setWhatsappError("Confira o número do WhatsApp, incluindo o DDD.");
      return;
    }
    setWhatsappSending(true);
    setWhatsappError("");
    try {
      const response = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: data.query, phone: cleanedPhone, marketplace: whatsappMarketplace }),
      });
      const body = await response.json() as { sent?: boolean; error?: string };
      if (!response.ok || !body.sent) throw new Error(body.error || "Não foi possível enviar as ofertas.");
      setWhatsappSent(true);
      setWhatsappStep("sent");
    } catch (cause) {
      setWhatsappError(cause instanceof Error ? cause.message : "Não foi possível enviar as ofertas.");
    } finally {
      setWhatsappSending(false);
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "search_offers",
      title: "Buscar ofertas",
      description: "Pesquisa ofertas no Mercado Livre e na Shopee e atualiza a página.",
      inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, description: "Produto procurado" } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: { query?: unknown }) => {
        if (typeof input?.query !== "string") throw new Error("query deve ser um texto");
        setQuery(input.query);
        return runSearch(input.query);
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runSearch]);

  const displayedOffers = useMemo(() => {
    if (!data) return [];
    return marketplaceFilter === "all" ? data.offers : data.offers.filter((offer) => offer.marketplace === marketplaceFilter);
  }, [data, marketplaceFilter]);
  const lowest = useMemo(() => displayedOffers.length ? displayedOffers.reduce((best, item) => item.price < best.price ? item : best) : undefined, [displayedOffers]);

  function toggleMarketplace(next: Exclude<MarketplaceFilter, "all">) {
    setMarketplaceFilter((current) => current === next ? "all" : next);
  }

  function reopenWhatsApp() {
    setWhatsappStep(whatsappSent ? "sent" : "ask");
    setWhatsappError("");
    setWhatsappOpen(true);
  }

  function chooseWhatsAppMarketplace(marketplace: WhatsAppMarketplace) {
    setWhatsappMarketplace(marketplace);
    setWhatsappError("");
    setWhatsappStep("phone");
  }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-white/10 bg-[#08111f]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3 text-white"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300 text-[#08111f] shadow-[0_0_30px_rgba(103,232,249,.3)]"><Sparkles size={19} strokeWidth={2.4}/></span><div><p className="text-[12px] font-semibold uppercase tracking-[.18em] text-cyan-200/70">Comparador</p><p className="text-base font-semibold tracking-tight">Oferta Direta</p></div></div>
        <div className="hidden items-center gap-2 text-sm text-slate-300 sm:flex"><ShieldCheck size={17} className="text-cyan-300"/>Seu número não fica salvo</div>
      </div>
    </header>

    <section className="relative overflow-hidden bg-[#08111f] text-white">
      <div className="orb orb-one"/><div className="orb orb-two"/>
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1fr_440px] lg:items-center">
        <div className="max-w-2xl"><p className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-300"><span className="h-px w-8 bg-cyan-300/70"/>Mercado Livre + Shopee</p><h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-.045em] sm:text-6xl">Você pede. Nós encontramos o melhor preço.</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">Digite o produto, compare as lojas e escolha se deseja receber as melhores ofertas no WhatsApp.</p></div>
        <form onSubmit={onSubmit} className="search-panel rounded-[28px] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-7">
          <label htmlFor="product" className="mb-2 block text-sm font-semibold text-slate-800">O que você quer comprar?</label>
          <div className="relative"><Search className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400" size={20}/><Input id="product" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: PlayStation 5 Slim" autoComplete="off" className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-12 pr-4 text-base shadow-none transition focus-visible:border-cyan-500 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-cyan-500/10"/></div>
          <Button type="submit" disabled={loading} className="mt-5 h-14 w-full rounded-2xl bg-[#0b2039] px-5 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#123052] disabled:cursor-wait disabled:opacity-70">{loading?<LoaderCircle className="animate-spin" size={20}/>:<Search size={19}/>} {loading?"Buscando ofertas...":"Buscar ofertas"}</Button>
          {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </form>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      {!data&&!loading&&<div className="grid gap-4 md:grid-cols-3">{[["01","Informe o produto","Pesquise por marca, modelo ou característica."],["02","Compare as lojas","Os resultados são reunidos e ordenados em uma única tela."],["03","Receba no WhatsApp","Depois da busca, escolha se deseja receber a seleção no seu número."]].map(([n,t,c])=><div key={n} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,.05)]"><p className="font-mono text-sm font-bold text-cyan-600">{n}</p><h2 className="mt-8 text-lg font-semibold tracking-tight text-slate-900">{t}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{c}</p></div>)}</div>}
      {loading&&<div className="grid place-items-center rounded-3xl border border-slate-200 bg-white py-20 text-center"><LoaderCircle className="animate-spin text-cyan-600" size={32}/><p className="mt-4 font-semibold text-slate-800">Comparando preços nas duas lojas...</p></div>}
      {data&&<div>
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-cyan-700">{displayedOffers.length} {marketplaceFilter === "all" ? "ofertas selecionadas" : `ofertas da ${marketplaceFilter}`}</p><h2 className="mt-1 text-3xl font-semibold tracking-[-.035em] text-slate-950">Melhores opções para “{data.query}”</h2></div>{whatsappSent&&<div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={17}/>Enviado no WhatsApp</div>}</div>
        <div className="mb-7 grid gap-3 sm:grid-cols-2" aria-label="Resultados por loja">
          <button type="button" aria-pressed={marketplaceFilter === "Mercado Livre"} onClick={() => toggleMarketplace("Mercado Livre")} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${marketplaceFilter === "Mercado Livre" ? "border-yellow-500 bg-yellow-300 shadow-[0_8px_24px_rgba(234,179,8,.2)] ring-2 ring-yellow-400/40" : "border-yellow-200 bg-white hover:bg-yellow-50"}`}><div><p className="text-sm font-bold text-yellow-900">Mercado Livre</p>{data.sources.mercadoLivre.status!=="ok"&&<p className="mt-0.5 text-xs text-yellow-800">{data.sources.mercadoLivre.status}</p>}</div><p className="text-sm font-semibold text-yellow-950"><span className="text-xl font-bold">{data.sources.mercadoLivre.count}</span> {data.sources.mercadoLivre.count===1?"resultado":"resultados"}</p></button>
          <button type="button" aria-pressed={marketplaceFilter === "Shopee"} onClick={() => toggleMarketplace("Shopee")} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${marketplaceFilter === "Shopee" ? "border-orange-500 bg-orange-300 shadow-[0_8px_24px_rgba(249,115,22,.2)] ring-2 ring-orange-400/40" : "border-orange-200 bg-white hover:bg-orange-50"}`}><div><p className="text-sm font-bold text-orange-900">Shopee</p>{data.sources.shopee.status!=="ok"&&<p className="mt-0.5 text-xs text-orange-800">{data.sources.shopee.status}</p>}</div><p className="text-sm font-semibold text-orange-950"><span className="text-xl font-bold">{data.sources.shopee.count}</span> {data.sources.shopee.count===1?"resultado":"resultados"}</p></button>
        </div>
        <p className="-mt-4 mb-7 text-center text-xs text-slate-500">Clique em uma loja para filtrar. Clique novamente para voltar a todas as ofertas.</p>
        {displayedOffers.length===0?<div className="rounded-3xl border border-slate-200 bg-white p-10 text-center"><ShoppingBag className="mx-auto text-slate-300" size={36}/><p className="mt-4 font-semibold text-slate-800">Nenhuma oferta disponível agora.</p><p className="mt-1 text-sm text-slate-500">Tente uma busca mais ampla ou confira a configuração das lojas.</p></div>:<div className="grid gap-4 md:grid-cols-2">{displayedOffers.map((offer,index)=><article key={`${offer.marketplace}-${offer.id}`} className="group flex gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,.09)] sm:p-5"><div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{offer.image?<img src={offer.image} alt="" className="h-full w-full object-contain p-2"/>:<ShoppingBag className="absolute inset-0 m-auto text-slate-300" size={32}/>} {offer===lowest&&<span className="absolute left-2 top-2 rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-900">Menor preço</span>}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${offer.marketplace==="Shopee"?"bg-orange-50 text-orange-700":"bg-yellow-50 text-yellow-800"}`}>{offer.marketplace}</span><span className="font-mono text-xs text-slate-400">#{String(index+1).padStart(2,"0")}</span></div><h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-800">{offer.title}</h3>{offer.shipping&&<p className="mt-1 text-xs font-semibold text-emerald-700">{offer.shipping}</p>}<div className="mt-3 flex items-end justify-between gap-3"><div>{offer.originalPrice&&offer.originalPrice>offer.price&&<p className="text-xs text-slate-400 line-through">{money.format(offer.originalPrice)}</p>}<p className="text-xl font-bold tracking-tight text-slate-950">{money.format(offer.price)}</p></div><a href={offer.url} target="_blank" rel="noreferrer sponsored" aria-label={`Abrir oferta: ${offer.title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white transition group-hover:bg-cyan-600"><ExternalLink size={17}/></a></div></div></article>)}</div>}
        {data.offers.length>0&&<Button type="button" onClick={reopenWhatsApp} className="mt-7 h-14 w-full rounded-2xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"><MessageCircle size={19}/>{whatsappSent?"Ofertas enviadas":"Receber ofertas no WhatsApp"}</Button>}
      </div>}
    </section>

    <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        {whatsappStep==="ask"&&<><DialogHeader><DialogTitle>Quer receber estas ofertas no WhatsApp?</DialogTitle><DialogDescription>Enviamos no máximo 3 mensagens, cada uma com uma das melhores ofertas.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setWhatsappOpen(false)}>Agora não</Button><Button type="button" onClick={() => setWhatsappStep("marketplace")} className="bg-emerald-600 text-white hover:bg-emerald-700"><MessageCircle size={18}/>Sim, quero receber</Button></DialogFooter></>}
        {whatsappStep==="marketplace"&&<><DialogHeader><DialogTitle>Quais ofertas você quer receber?</DialogTitle><DialogDescription>Escolha a origem das ofertas. Serão enviadas no máximo 3 mensagens.</DialogDescription></DialogHeader><div className="grid gap-3"><Button type="button" onClick={() => chooseWhatsAppMarketplace("all")} className="h-12 justify-start bg-slate-950 text-white hover:bg-slate-800"><Sparkles size={18}/>Melhores preços das duas lojas</Button><Button type="button" onClick={() => chooseWhatsAppMarketplace("Mercado Livre")} className="h-12 justify-start bg-yellow-300 text-yellow-950 hover:bg-yellow-400"><ShoppingBag size={18}/>Somente Mercado Livre</Button><Button type="button" onClick={() => chooseWhatsAppMarketplace("Shopee")} className="h-12 justify-start bg-orange-500 text-white hover:bg-orange-600"><ShoppingBag size={18}/>Somente Shopee</Button></div><DialogFooter><Button type="button" variant="outline" onClick={() => setWhatsappStep("ask")}>Voltar</Button></DialogFooter></>}
        {whatsappStep==="phone"&&<><DialogHeader><DialogTitle>Qual é o seu WhatsApp?</DialogTitle><DialogDescription>Digite seu número com DDD para receber até 3 mensagens com ofertas de {whatsappMarketplace === "all" ? "Mercado Livre e Shopee" : whatsappMarketplace}.</DialogDescription></DialogHeader><div><label htmlFor="whatsapp-phone" className="mb-2 block text-sm font-semibold text-slate-800">Número com DDD</label><div className="flex h-14 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10"><span className="grid place-items-center border-r border-slate-200 px-4 text-sm font-semibold text-slate-500">+55</span><Input id="whatsapp-phone" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="(28) 99999-9999" className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 text-base shadow-none focus-visible:ring-0"/></div>{whatsappError&&<p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{whatsappError}</p>}</div><DialogFooter><Button type="button" variant="outline" disabled={whatsappSending} onClick={() => setWhatsappStep("marketplace")}>Voltar</Button><Button type="button" disabled={whatsappSending} onClick={sendOffers} className="bg-emerald-600 text-white hover:bg-emerald-700">{whatsappSending?<LoaderCircle className="animate-spin" size={18}/>:<Send size={18}/>} {whatsappSending?"Enviando...":"Enviar ofertas"}</Button></DialogFooter></>}
        {whatsappStep==="sent"&&<><DialogHeader><div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={30}/></div><DialogTitle className="text-center">Ofertas enviadas!</DialogTitle><DialogDescription className="text-center">Enviamos até 3 mensagens. Confira a conversa no WhatsApp informado.</DialogDescription></DialogHeader><Button type="button" onClick={() => setWhatsappOpen(false)} className="bg-emerald-600 text-white hover:bg-emerald-700">Concluir</Button></>}
      </DialogContent>
    </Dialog>

    <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs leading-5 text-slate-500">Preços e disponibilidade podem mudar. Confirme os dados na loja antes de comprar.</footer>
  </main>;
}
