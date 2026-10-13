import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steward | A better everyday visit",
  description:
    "An interactive merchant experience concept by Decionis Steward, prepared for Ruian Offices. Explore fictional merchants with a live AI assistant.",
  robots: { index: false, follow: false },
  icons: { icon: "/decionis.png" },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
