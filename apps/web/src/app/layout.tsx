import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nebula AI",
  description: "Describe your app. Watch it get built.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
