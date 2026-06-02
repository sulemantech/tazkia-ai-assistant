import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tazkia AI Assistant',
  description: 'Islamic Knowledge RAG API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
