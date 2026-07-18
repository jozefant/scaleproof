import type { Metadata } from "next";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scaleproof — Codebase scale readiness",
  description:
    "An evidence-based snapshot of whether a codebase can support 10x users and a growing engineering team.",
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
