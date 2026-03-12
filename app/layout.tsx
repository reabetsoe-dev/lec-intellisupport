import "./globals.css"
import { AppShell } from "@/components/layout/AppShell"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
