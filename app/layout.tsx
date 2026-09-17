import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oferta Direta — Comparador Mercado Livre, Shopee e Amazon",
  description: "Encontre ofertas no Mercado Livre, na Shopee e na Amazon e receba a seleção no WhatsApp.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
