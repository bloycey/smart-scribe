import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Smart Scribe",
  description: "A considered scribe for anything you can say out loud.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="px-5 sm:px-8 py-5 sm:py-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-2.5 text-foreground hover:opacity-80 transition"
          >
            <span
              className="text-accent text-lg leading-none group-hover:rotate-12 transition-transform"
              aria-hidden
            >
              ✦
            </span>
            <span className="font-serif text-xl tracking-tight">
              Smart Scribe
            </span>
          </Link>
        </header>
        <main className="flex-1 px-5 sm:px-8 pb-16">{children}</main>
      </body>
    </html>
  );
}
