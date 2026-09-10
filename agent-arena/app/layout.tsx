import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Arena | Trading laboratory",
  description: "Five independent agents. Real market data. Transparent paper trading.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
