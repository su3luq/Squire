import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'RankedLearning',
  description: 'Gamified learning platform for the classroom.',
};

// Pre-paint script: runs before React mounts so the `.dark` class is on
// `<html>` before the first frame, preventing a flash of the wrong
// theme. Reads localStorage `rl-theme` (light | dark | system) and falls
// back to the OS preference for 'system' or unset users. The script is
// minimal and intentionally inline — moving it into a separate module
// would defeat the purpose because that module would need to load.
const themeInitScript = `
try {
  var pref = localStorage.getItem('rl-theme');
  var sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = pref === 'dark' || ((pref === 'system' || pref === null) && sysDark);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster position="top-center" closeButton />
      </body>
    </html>
  );
}
