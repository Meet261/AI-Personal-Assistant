import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import CmdKProvider from '@/components/CmdKProvider'
import QuickAddTask from '@/components/QuickAddTask'

export const metadata: Metadata = {
  title: 'Personal OS',
  description: 'Your personal productivity assistant',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" data-theme="nordic">
      <body className="h-full flex overflow-hidden" suppressHydrationWarning>
        <CmdKProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          <QuickAddTask />
        </CmdKProvider>
      </body>
    </html>
  )
}
