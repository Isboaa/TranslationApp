import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Norsk → Italiensk',
  description: 'Oversett norske setninger til italiensk med audio',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
