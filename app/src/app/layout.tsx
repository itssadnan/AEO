import type { Metadata } from "next";
import "./globals.css";

// Deliberately not using next/font/google here: it requires a build-time fetch to
// Google Fonts, which is one more thing that can fail a production build for no
// product benefit at this stage. Using the system font stack (via Tailwind's default
// font-sans) instead. Revisit with next/font/local or a self-hosted font if/when
// there's an actual brand typeface to ship.
export const metadata: Metadata = {
  title: "AEO Visibility Platform",
  description: "Tracks whether AI answer engines mention and recommend your brand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
