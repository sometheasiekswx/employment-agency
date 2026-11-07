import type { Metadata } from "next";
import { AppearanceSync } from "@/components/appearance";
import { DraftProvider } from "@/components/unsaved";
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
  icons: { icon: "/icon.svg" },
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
          <WorkspaceProvider>
            <Shell>{children}</Shell>
          </WorkspaceProvider>
        </DraftProvider>
      </body>
    </html>
  );
}
