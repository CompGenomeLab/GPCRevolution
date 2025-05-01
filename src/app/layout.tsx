import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { Header } from '@/components/header';

const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'GPCREVOdb',
  description: 'GPCR Evolution Database',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${openSans.className} bg-background text-foreground flex flex-col h-screen relative`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header className="flex-none sticky top-0 z-10" />
          <main className="p-4 grow">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
