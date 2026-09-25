import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "maimai SoCal Queue Tracker",
  description: "Community reported maimai DX status at Southern California Round1 locations.",
  applicationName: "maimai SoCal Queue Tracker",
  icons: { apple: "/maimai-queue-tracker-logo.png" },
  appleWebApp: { capable: true, title: "maimai SoCal", statusBarStyle: "default" },
  manifest: "/manifest.json",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f5f2" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<RegisterSW/></body></html>;
}
