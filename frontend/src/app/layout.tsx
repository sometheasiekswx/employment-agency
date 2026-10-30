import type { Metadata } from "next";
import { DraftProvider } from "@/components/unsaved";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Employment Agency",
  description:
    "Your private career workspace. Review opportunities, documents and career evidence.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/manrope-400_800-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <DraftProvider>
          <WorkspaceProvider>
            <Shell>{children}</Shell>
          </WorkspaceProvider>
        </DraftProvider>
      </body>
    </html>
  );
}
