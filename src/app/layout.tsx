import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Anton } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { FirebaseAuthSync } from "@/components/firebase-auth-sync";
import { BuyerOrderAlerts } from "@/components/buyer/order-alerts";
import { OfflineBanner } from "@/components/offline-banner";
import { Navbar } from "@/components/nav/navbar";
import { Footer } from "@/components/nav/footer";
import { cn } from "@/lib/utils";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CloseBy — Everything you need, CloseBy",
  description: "Discover and order from shops near you in Guna.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn("font-sans", plusJakarta.variable, anton.variable)}>
        <body className={cn(plusJakarta.variable, "font-sans antialiased")}>
          <FirebaseAuthSync />
          <BuyerOrderAlerts />
          <OfflineBanner />
          <div className="flex min-h-svh flex-col">
            <Navbar />
            <div className="flex-1 pb-16 sm:pb-0">{children}</div>
            <Footer />
          </div>
          <Toaster position="top-center" richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
