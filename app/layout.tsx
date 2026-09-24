import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decionis Steward",
  description:
    "The open-source customer support decisioning platform: see what is happening across your accounts, triage one queue with the evidence behind each recommendation, act before the customer asks. Decisions are recorded and executed by Decionis.",
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
