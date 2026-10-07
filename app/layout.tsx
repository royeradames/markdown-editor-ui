import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "Markdown Editor | Local documents",
  description: "Write and preview Markdown, with explicit saves in this browser. No account or cloud synchronization.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}<noscript><p className="noscript">JavaScript is needed to edit and save in this browser. The source examples below remain readable.</p></noscript></body></html>;
}
