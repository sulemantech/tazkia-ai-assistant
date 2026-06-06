import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tazkia AI — Islamic Knowledge Assistant',
  description: 'Search and ask questions across Quran, Hadith, and Tafsir Ibn Kathir',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
