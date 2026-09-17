import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oferta Direta — Comparador Shopee e Mercado Livre",
  description: "Encontre ofertas na Shopee e no Mercado Livre e receba a seleção no WhatsApp.",
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
