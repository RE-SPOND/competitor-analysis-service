import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Конкурентный анализ | CFD",
  description: "Автоматизированный конкурентный анализ по ссылке на сайт, описанию и региону.",
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
      <body>{children}</body>
    </html>
  );
}
