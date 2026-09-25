import { Link } from 'react-router-dom'
import { ArrowRightIcon } from 'lucide-react'
import { ActivityList } from '@/components/activity-list'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAppState } from '@/lib/app-state'
import { useT } from '@/lib/i18n'

const RECENT_LIMIT = 5

export function ActivityCard() {
  const { activity, activityLoading } = useAppState()
  const t = useT()

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('activity.title')}</CardTitle>
        {activity.length > 0 && (
          <CardAction>
            <Link
              to="/app/activity"
              className="inline-flex items-center gap-2 text-sm text-primary-ink underline-offset-4 hover:underline"
            >
              {t('activity.viewAll')}
              <ArrowRightIcon className="size-4" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ActivityList items={activity.slice(0, RECENT_LIMIT)} loading={activityLoading} />
      </CardContent>
    </Card>
  )
}
