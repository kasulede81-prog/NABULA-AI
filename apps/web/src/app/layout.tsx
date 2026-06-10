import type { Metadata } from "next";
import "../config/supabase";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
