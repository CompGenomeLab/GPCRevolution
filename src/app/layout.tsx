import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { TheHeader } from '@/components/TheHeader';
import { Toaster } from '@/components/ui/sonner';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'GPCR Evolution DB',
  description: 'Tools for analyzing GPCR evolution',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${openSans.className} bg-background text-foreground flex flex-col min-h-screen relative`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TheHeader className="flex-none sticky top-0 z-50" />
          <main className="grow">{children}</main>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
