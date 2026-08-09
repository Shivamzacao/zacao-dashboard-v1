import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ZACAO Executive Intelligence",
    template: "%s · ZACAO Executive Intelligence",
  },
  description: "ZACAO internal executive intelligence dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
