import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

function getAppUrl(): string {
  const rawUrl = (process.env.NEXT_PUBLIC_URL ?? "https://wallet-wrapped-mini.vercel.app").trim();
  const withProtocol = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
  return withProtocol.replace(/\/$/, "");
}

const appUrl = getAppUrl();

const miniAppEmbed = {
  version: "next",
  imageUrl: `${appUrl}/og-image.svg`,
  button: {
    title: "Open Wallet Wrapped",
    action: {
      type: "launch_miniapp",
      name: "Wallet Wrapped",
      url: appUrl,
      splashImageUrl: `${appUrl}/splash.svg`,
      splashBackgroundColor: "#03111f",
    },
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Wallet Wrapped | Base Mini App",
  description: "Drop any Base wallet address and generate a no-backend, shareable onchain wrapped.",
  openGraph: {
    title: "Wallet Wrapped",
    description: "A lightweight Base mini app that turns wallet activity into a shareable recap.",
    images: [`${appUrl}/og-image.svg`],
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify(miniAppEmbed),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
