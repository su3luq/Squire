import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

// Monospace face for numeric/stat displays (XP, ranks, counts, timers).
// Exposed as --font-mono; globals.css routes the `tabular-nums` utility
// through it so every number in the app picks up the tabular HUD look.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  // Variable font (no fixed weight list) — one file covers every numeric
  // weight the app uses (400 body … 800 hero) so no number falls back.
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
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
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
