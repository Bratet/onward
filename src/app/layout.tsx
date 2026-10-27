import type { Metadata } from 'next'
import { Nav } from '@/components/Nav'
import '@fontsource-variable/literata/opsz.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Onward',
  description: 'Your job application companion: tailor, render, track.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { const theme = localStorage.getItem('career-ops-theme'); document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system' })()`,
          }}
        />
      </head>
      <body>
        <Nav />
        <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">{children}</main>
      </body>
    </html>
  )
}
