import { Link } from 'react-router-dom'
import { CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

export function NotFoundContent() {
  const t = useT()

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CompassIcon className="size-7" />
      </span>
      <p className="mt-6 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        404
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{t('notFound.title')}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{t('notFound.body')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/">{t('notFound.goHome')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app">{t('notFound.goApp')}</Link>
        </Button>
      </div>
    </div>
  )
}
