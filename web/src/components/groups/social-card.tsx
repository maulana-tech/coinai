import { useEffect, useMemo, useState } from 'react'
import { CopyIcon, DownloadIcon, Loader2Icon, Share2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { KIND, useMoney } from '@/components/groups/group-meta'
import { GLASS } from '@/components/groups/group-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { duesBehind, fundStatus, type GroupFund, type MemberDues } from '@/lib/groups'
import { formatDate, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { renderShareCard, SHARE_SIZE, type ShareFormat } from '@/lib/share-card'
import { cn } from '@/lib/utils'

const STATUS_KEY: Record<ReturnType<typeof fundStatus>, MessageKey> = {
  open: 'groups.statusOpen',
  reached: 'groups.statusReached',
  failed: 'groups.statusFailed',
  ended: 'groups.statusEnded',
  cancelled: 'groups.statusCancelled',
}
const CTA: Record<GroupFund['kind'], MessageKey> = {
  patungan: 'groups.socialCtaPatungan',
  iuran: 'groups.socialCtaIuran',
  donasi: 'groups.socialCtaDonasi',
}

/**
 * Share a group: a ready-to-post image (feed 4:5 or story 9:16) in the app's style, to download or hand to the
 * phone's share sheet (Instagram, WhatsApp Status, …), plus link shares for chat apps.
 */
export function SocialCard({ fund, members, highlight }: { fund: GroupFund; members: { dues: MemberDues }[] | null; highlight: boolean }) {
  const t = useT()
  const { locale } = useSettings()
  const { main } = useMoney()
  const [format, setFormat] = useState<ShareFormat>('post')
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const link = `${window.location.origin}/g/${fund.id}`
  const text = t('groups.shareText', { title: fund.title, link })

  const input = useMemo(() => {
    const paidUp = members?.length ? members.filter((m) => duesBehind(m.dues) === 0).length / members.length : null
    const meta =
      fund.kind === 'iuran'
        ? t('groups.duesEvery', { amount: main(fund.dues), days: Math.round(fund.period / 86_400) }) + ' · ' + t('groups.membersCount', { n: fund.members })
        : [t('groups.contributorsCount', { n: fund.contributors }), fund.deadline ? t('groups.closesOn', { date: formatDate(BigInt(fund.deadline), locale) }) : ''].filter(Boolean).join(' · ')
    return {
      image: KIND[fund.kind].image,
      label: t(KIND[fund.kind].panelLabel),
      status: t(STATUS_KEY[fundStatus(fund)]),
      title: fund.title,
      amount: main(fund.raised),
      amountOf: fund.target > 0n ? t('groups.ofTarget', { target: main(fund.target) }) : t('groups.collected'),
      progress: fund.target > 0n ? Number((fund.raised * 1000n) / fund.target) / 1000 : paidUp,
      done: fund.target > 0n ? fund.raised >= fund.target : paidUp === 1,
      meta,
      cta: t(CTA[fund.kind]),
      link,
      scanHint: t('groups.socialScan'),
    }
  }, [fund, members, locale, main, t, link])

  useEffect(() => {
    let live = true
    let url = ''
    setImage(null)
    setFailed(false)
    renderShareCard(input, format).then(
      (blob) => {
        if (!live) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [input, format])

  const fileName = `coinai-${fund.kind}-${fund.id}-${format}.png`
  const download = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.url
    a.download = fileName
    a.click()
  }
  const file = image ? new File([image.blob], fileName, { type: 'image/png' }) : null
  const canShareFile = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  const shareImage = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: fund.title, text })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(t('groups.socialShareFailed'))
    }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success(t('settings.copied'))
  }

  const SOCIAL = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(text)}` },
    { label: 'X', href: `https://x.com/intent/post?text=${encodeURIComponent(t('groups.shareText', { title: fund.title, link: '' }).trim())}&url=${encodeURIComponent(link)}` },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(fund.title)}` },
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}` },
  ]
  const { w, h } = SHARE_SIZE[format]

  return (
    <Card className={cn(GLASS, highlight && 'border-primary ring-1 ring-primary')}>
      <CardHeader>
        <CardTitle>{t(highlight ? 'groups.liveTitle' : 'groups.socialTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t(highlight ? 'groups.liveBody' : 'groups.socialCaption')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={format} onValueChange={(v) => setFormat(v as ShareFormat)}>
          <TabsList className="w-full rounded-full">
            <TabsTrigger value="post" className="flex-1 rounded-full">{t('groups.socialPost')}</TabsTrigger>
            <TabsTrigger value="story" className="flex-1 rounded-full">{t('groups.socialStory')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mx-auto w-full" style={{ maxWidth: format === 'story' ? 240 : 320 }}>
          <div className="overflow-hidden rounded-xl border shadow-lg shadow-black/10" style={{ aspectRatio: `${w} / ${h}` }}>
            {image ? (
              <img src={image.url} alt={t('groups.socialAlt', { title: fund.title })} className="h-full w-full object-cover" />
            ) : failed ? (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{t('groups.socialFailed')}</div>
            ) : (
              <Skeleton className="h-full w-full rounded-none bg-card/60" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-full" disabled={!image} onClick={download}>
            {image ? <DownloadIcon className="size-4" /> : <Loader2Icon className="size-4 animate-spin" />}
            {t('groups.socialDownload')}
          </Button>
          <Button className="rounded-full" disabled={!image} onClick={() => (canShareFile ? void shareImage() : download())}>
            <Share2Icon className="size-4" />
            {t('groups.socialShare')}
          </Button>
        </div>
        {!canShareFile && image && <p className="-mt-2 text-center text-xs text-muted-foreground">{t('groups.socialDesktopHint')}</p>}

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate rounded-lg border bg-muted/50 px-2 py-1.5 font-mono text-xs text-muted-foreground">{link}</p>
            <Button size="sm" variant="outline" onClick={() => void copy()} aria-label={t('paylink.copy')}>
              <CopyIcon className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border bg-card/60 px-3 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-card"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
