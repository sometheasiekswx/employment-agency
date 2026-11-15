import type { Metadata } from "next";
import { AppearanceSync } from "@/components/appearance";
import { DraftProvider } from "@/components/unsaved";
import { NotificationProvider } from "@/components/notification-center";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
import { appearanceBootstrap } from "@/lib/appearance";
import "./globals.css";
import "@/features/secondary.css";

export const metadata: Metadata = {
  title: "Employment Agency",
  description:
    "Your private career workspace. Review opportunities, documents and career evidence.",
  robots: { index: false, follow: false },
  manifest: "/agency.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/agency-favicon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon-180.png", sizes: "180x180" }],
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#C994F3" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <AppearanceSync />
        <DraftProvider>
          <NotificationProvider>
            <WorkspaceProvider>
              <Shell>{children}</Shell>
            </WorkspaceProvider>
          </NotificationProvider>
        </DraftProvider>
      </body>
    </html>
  );
}
