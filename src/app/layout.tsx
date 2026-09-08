import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Payslip Rigg",
  description: "Modern Payslip & Timesheet Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex h-screen overflow-hidden bg-background text-foreground`}>
        <Sidebar />
        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
          <div className="mx-auto max-w-7xl p-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
