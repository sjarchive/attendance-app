import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const appSans = Geist({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

const appMono = Geist_Mono({
  variable: "--font-app-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Attendance Tracker",
  description:
    "Daily student attendance tracking for college departments — professors mark attendance per course, admins manage accounts, programs and courses.",
  keywords: ["attendance", "college", "department", "professor", "student"],
  icons: {
    icon: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t);r.style.colorScheme=t;}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${appSans.variable} ${appMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            offset={{ top: 68, right: 20 }}
            mobileOffset={{ top: 64 }}
            richColors
            closeButton
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
