import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decionis Steward",
  description:
    "Customer and account decisions with their evidence in view: where each data point came from, how fresh it is, and what led to the recommendation. Operators review; Decionis decides.",
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
