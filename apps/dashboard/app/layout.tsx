import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Outfit, Geist_Mono } from 'next/font/google'
import './globals.css'

const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'SyntaxWP — Your website, always protected',
  description:
    'SyntaxWP watches your WordPress and WooCommerce site around the clock, fixes problems before they cost you sales, and only asks when it matters.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#F6F5F1',
}

import { StreamProvider } from '@/lib/stream-context'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} bg-background`}
    >
      <head />
      <body className="font-sans antialiased bg-blueprint-grid min-h-screen" suppressHydrationWarning>
        <StreamProvider>
          {children}
        </StreamProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
