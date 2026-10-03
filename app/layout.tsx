import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "../components/Provider";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "DeepDoc - Chat with any PDF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <body>
          <Providers>
            {children}
          </Providers>
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "glass !rounded-lg !text-sm !text-slate-800",
              style: { boxShadow: "none" },
            }}
          />
        </body>
    </html>
  );
}
