import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata = {
  title: 'AI 错题本 | 高考备战',
  description: '高考备战智能复习系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-zinc-100 min-h-[100dvh] selection:bg-blue-500/30">
        {children}
      </body>
    </html>
  );
}
