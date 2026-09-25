import { Link } from 'react-router-dom'
import { FloatingDeco } from '@/components/brand/floating-deco'
import { LogoWordmark } from '@/components/brand/logo'
import { NotFoundContent } from '@/components/not-found-content'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n'

export function NotFoundPage() {
  const t = useT()

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <FloatingDeco side="both" />
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <Link to="/">
          <LogoWordmark />
        </Link>
        <Badge variant="outline" className="text-muted-foreground">
          {t('topbar.testnet')}
        </Badge>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6">
        <NotFoundContent />
      </main>
    </div>
  )
}
