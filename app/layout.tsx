import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decionis Steward",
  description:
    "The review console for customer operations: processing-limit reviews, expansion, friction and KYC/KYB escalations in one queue, the evidence behind each, and every decision recorded and executed by Decionis.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
