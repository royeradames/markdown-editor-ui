import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

// Variable Roboto faces (OFL; Roboto Slab is Apache-2.0) from the pinned Fontsource packages, served by next/font from this origin only.
// next/font/google fails to resolve its font files under Turbopack in Next 16.3.6, so the files are local.
const roboto = localFont({ src: "../node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2", weight: "100 900", variable: "--font-roboto", display: "swap" });
const robotoSlab = localFont({ src: "../node_modules/@fontsource-variable/roboto-slab/files/roboto-slab-latin-wght-normal.woff2", weight: "100 900", variable: "--font-slab", display: "swap" });
const robotoMono = localFont({ src: "../node_modules/@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2", weight: "100 700", variable: "--font-mono", display: "swap" });

const SITE_NAME = "Markdown";
const SITE_URL = "https://markdown-editor-ui.vercel.app/";
const title = "Markdown | Write and preview documents in this browser";
const description = "Write and preview Markdown, with explicit saves in this browser. No account or cloud synchronization.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: { title, description, siteName: SITE_NAME, url: SITE_URL, type: "website" },
  robots: { index: false, follow: false },
};

const website = { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${roboto.variable} ${robotoSlab.variable} ${robotoMono.variable}`}><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
    {children}
    <noscript><p className="noscript">JavaScript is needed to edit and save in this browser. The source examples below remain readable.</p></noscript>
  </body></html>;
}
