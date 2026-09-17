export default function MercadoLivreCallbackPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Mercado Livre</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Autorização recebida</h1>
        <p className="mt-4 leading-7 text-slate-600">
          Copie o endereço completo exibido na barra do navegador, volte ao PowerShell onde você executou
          <strong> npm run ml:auth</strong>, cole o endereço e pressione Enter.
        </p>
        <p className="mt-4 text-sm text-slate-500">O código é temporário e será trocado pelos tokens com segurança.</p>
      </section>
    </main>
  );
}
