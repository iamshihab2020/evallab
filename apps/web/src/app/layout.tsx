import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/nav";
import { QueryProvider } from "@/components/query-provider";
import { ThemeNoFlashScript } from "@/components/theme-toggle";
import { Tour } from "@/components/tour";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WakeUpBanner } from "@/components/wake-up-banner";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EvalLab — measure what your prompts actually do",
  description: "Systematic LLM evaluation. Test sets · agents · runs · compare.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeNoFlashScript />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <QueryProvider>
          <TooltipProvider delayDuration={150}>
            <WakeUpBanner />
            <Nav />
            <main className="container mx-auto flex-1 px-6 sm:px-10 lg:px-16 py-10">
              {children}
            </main>
            <footer className="border-t border-border/60 mt-16 py-5 text-xs text-muted-foreground">
              <div className="container mx-auto flex items-center justify-between px-6 sm:px-10 lg:px-16">
                <span className="font-mono">EvalLab · v1</span>
                <span className="font-mono">SPEC.md</span>
              </div>
            </footer>
            <Tour />
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
