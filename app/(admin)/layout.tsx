import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { InstallCapture } from "@/components/pwa/InstallCapture";
import { INSTALL_CAPTURE_SCRIPT } from "@/components/pwa/install-capture-script";
import { IosGestureGuard } from "@/components/pwa/IosGestureGuard";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { StaleDeployGuard } from "@/components/StaleDeployGuard";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agenda · Casale del Notaio",
  description: "Agenda digitale dei banchetti del Casale del Notaio.",
  applicationName: "Agenda Casale",
  // Solo le pagine admin collegano il manifest (la route vive sotto /admin, scope /admin/).
  manifest: "/admin/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Agenda Casale",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1C2B2D",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${geist.variable} h-full`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        {/* Eseguito durante il parsing, prima dell'idratazione: non perde beforeinstallprompt. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
        {children}
        <InstallCapture />
        <IosGestureGuard />
        <ServiceWorkerRegister />
        <StaleDeployGuard />
      </body>
    </html>
  );
}
