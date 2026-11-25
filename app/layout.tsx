import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "What's for Kids (demo)",
  description: "Clickable demo of the What's for Kids discovery platform. Dummy data only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
