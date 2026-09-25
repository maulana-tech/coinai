import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRightIcon, PlusIcon } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'
import { EXPLORER_CONTRACT_URL } from '@/lib/config'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Editorial, film-led landing: a fixed hairline frame (top bar + left rail with ✦ marks),
// full-bleed painted loops behind oversized light serif type, mono micro-labels.

const RAIL = 'md:pl-[80px]' // content starts right of the rail
const SECTIONS: { id: string; label: MessageKey }[] = [
  { id: 'model', label: 'lp.navModel' },
  { id: 'agents', label: 'lp.navAgents' },
  { id: 'terms', label: 'lp.navTerms' },
  { id: 'questions', label: 'lp.navQuestions' },
]

const mono = 'font-mono text-[10px] font-bold uppercase tracking-[0.24em]'

function usePrefersReducedMotion() {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduced
}

function Star({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none text-white/80', className)}>
      ✦
    </span>
  )
}

function CtaButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/app"
      className={cn(
        'group inline-flex items-center gap-4 rounded-[3px] border border-white/15 bg-[#0b0b0b] py-2 pr-2 pl-4 text-white shadow-lg transition-colors hover:border-white/40 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none',
        mono,
        className,
      )}
    >
      {children}
      <span className="flex size-6 items-center justify-center rounded-[2px] border border-white/30 transition-transform group-hover:translate-x-0.5">
        <ArrowRightIcon className="size-3" />
      </span>
    </Link>
  )
}

function Film({ name, dim = 'from-black/70 via-black/30' }: { name: string; dim?: string }) {
  const reduced = usePrefersReducedMotion()
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {reduced ? (
        <img src={`/landing/${name}.jpg`} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          className="h-full w-full object-cover"
          src={`/landing/${name}.mp4`}
          poster={`/landing/${name}.jpg`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
      <div className={cn('absolute inset-0 bg-gradient-to-r to-transparent', dim)} />
    </div>
  )
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Title({ k, className }: { k: MessageKey; className?: string }) {
  const t = useT()
  return (
    // leading last: tailwind-merge drops it when className overrides the font size
    <h2 className={cn('font-serif text-[clamp(2.75rem,7vw,6.25rem)] font-light tracking-[-0.02em] whitespace-pre-line', className, 'leading-[0.95]')}>
      {t(k)}
    </h2>
  )
}

// ─── Frame: top bar + left rail with section index ──────────────────────────

function Frame() {
  const t = useT()
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-[64px] items-center justify-between border-b border-white/15 md:h-[80px]">
        <Link
          to="/"
          aria-label="coinAI"
          className="pointer-events-auto flex h-full w-[64px] items-center justify-center border-r border-white/15 md:w-[80px]"
        >
          <LogoMark size={30} forceDark />
        </Link>
        <CtaButton className="pointer-events-auto mr-4 md:mr-8">{t('lp.cta')}</CtaButton>
      </header>
      <nav aria-label={t('nav.menu')} className="pointer-events-none fixed top-[80px] bottom-0 left-0 z-50 hidden w-[80px] border-r border-white/15 mix-blend-difference md:block">
        <ul className="absolute top-8 left-full space-y-3">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="pointer-events-auto flex items-center gap-2.5 py-0.5">
                <span className={cn('h-px bg-white/60 transition-all duration-500', active === s.id ? 'w-4' : 'w-2')} />
                <span className={cn(mono, 'whitespace-nowrap text-white transition-opacity duration-500', active === s.id ? 'opacity-90' : 'opacity-0')}>
                  {t(s.label)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}

// ─── Sections ────────────────────────────────────────────────────────────────

function Hero() {
  const t = useT()
  return (
    <section className={cn('relative isolate flex min-h-svh flex-col text-white', RAIL)}>
      <Film name="hero" />
      <div className="flex flex-1 flex-col justify-center px-6 pt-28 md:px-10 lg:px-14">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 fill-mode-both">
          <h1 className="max-w-4xl font-serif text-[clamp(3.25rem,8.5vw,7.5rem)] leading-[0.92] font-light tracking-[-0.03em]">
            {t('lp.heroTitle')}
          </h1>
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4 delay-150 duration-1000 fill-mode-both">
          <p className="mt-6 max-w-md font-serif text-[clamp(1.25rem,2.2vw,1.75rem)] leading-[1.2] font-light whitespace-pre-line text-white/90">
            {t('lp.heroSub')}
          </p>
        </div>
        <div className="mt-10 animate-in fade-in delay-300 duration-1000 fill-mode-both">
          <CtaButton>{t('lp.cta')}</CtaButton>
        </div>
      </div>
      <div className="relative border-t border-white/15 px-6 pt-8 pb-10 md:px-10 lg:pl-[260px]">
        <Star className="top-0 left-0" />
        <p className="max-w-md text-[15px] leading-relaxed text-white/85">{t('lp.heroBody')}</p>
        <p className={cn(mono, 'mt-8 text-white/50')}>{t('lp.heroFoot')}</p>
      </div>
    </section>
  )
}

function FilmChapter({ id, film, tag, title, body }: { id: string; film: string; tag: MessageKey; title: MessageKey; body: MessageKey }) {
  const t = useT()
  return (
    <section id={id} className={cn('relative isolate flex min-h-svh scroll-mt-20 flex-col justify-end text-white', RAIL)}>
      <Film name={film} dim="from-black/65 via-black/20" />
      <div className="relative border-t border-white/15 px-6 pt-10 pb-16 md:px-10 lg:px-14">
        <Star className="top-0 left-0" />
        <Reveal>
          <Title k={title} />
        </Reveal>
        <Reveal delay={0.15} className="mt-8 flex flex-col gap-4 md:flex-row md:items-start md:gap-12">
          <span className={cn(mono, 'shrink-0 rounded-[3px] border border-white/25 bg-black/40 px-3 py-1.5 text-white/80')}>{t(tag)}</span>
          <p className="max-w-lg text-[15px] leading-relaxed text-white/85">{t(body)}</p>
        </Reveal>
      </div>
    </section>
  )
}

function Terms() {
  const t = useT()
  const blocks: { title: MessageKey; body: MessageKey; note: MessageKey }[] = [
    { title: 'lp.terms1Title', body: 'lp.terms1Body', note: 'lp.terms1Note' },
    { title: 'lp.terms2Title', body: 'lp.terms2Body', note: 'lp.terms2Note' },
  ]
  return (
    <section id="terms" className={cn('relative scroll-mt-20 bg-[#0b0b0b] text-white', RAIL)}>
      {blocks.map((b, i) => (
        <div key={b.title} className="relative grid gap-10 border-t border-white/15 px-6 py-20 md:grid-cols-[1.1fr_1fr] md:px-10 md:py-28 lg:px-14">
          <Star className="top-0 left-0" />
          <Reveal>
            <p className={cn(mono, 'mb-6 text-white/45')}>0{i + 1}</p>
            <Title k={b.title} className="text-[clamp(2.5rem,5.5vw,4.75rem)]" />
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/75">{t(b.body)}</p>
          </Reveal>
          <Reveal delay={0.15} className="self-end border-l border-white/15 pl-6">
            <p className={cn(mono, 'mb-3 text-white/45')}>{t('lp.disclosure')}</p>
            <p className="max-w-md text-[15px] leading-relaxed text-white/85">{t(b.note)}</p>
          </Reveal>
        </div>
      ))}
    </section>
  )
}

const TEAM: { name: MessageKey; role: MessageKey }[] = [
  { name: 'agent.roleMarket', role: 'lp.teamMarket' },
  { name: 'agent.roleSavings', role: 'lp.team1' },
  { name: 'agent.roleInvestment', role: 'lp.team2' },
  { name: 'agent.roleGuard', role: 'lp.team3' },
  { name: 'agent.roleRisk', role: 'lp.team4' },
  { name: 'agent.roleReporter', role: 'lp.team5' },
]

function Team() {
  const t = useT()
  return (
    <section className={cn('relative bg-[#f1ece2] text-[#141414]', RAIL)}>
      <div className="relative grid gap-12 border-t border-black/15 px-6 py-20 md:grid-cols-[1fr_1.2fr] md:px-10 md:py-28 lg:px-14">
        <Reveal>
          <p className={cn(mono, 'mb-6 text-black/45')}>{t('lp.teamTag')}</p>
          <Title k="lp.teamTitle" className="text-[clamp(2.5rem,5.5vw,4.75rem)]" />
        </Reveal>
        <ol className="self-end">
          {TEAM.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.06}>
              <li className="grid grid-cols-[3rem_1fr] items-baseline gap-4 border-t border-black/15 py-5">
                <span className={cn(mono, 'text-black/45')}>0{i + 1}</span>
                <div>
                  <p className="font-serif text-2xl font-normal">{t(m.name)}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-black/65">{t(m.role)}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

const FAQ: { q: MessageKey; a: MessageKey }[] = [1, 2, 3, 4, 5].map((n) => ({
  q: `lp.faq${n}Q` as MessageKey,
  a: `lp.faq${n}A` as MessageKey,
}))

function Questions() {
  const t = useT()
  return (
    <section id="questions" className={cn('relative scroll-mt-20 bg-[#0b0b0b] text-white', RAIL)}>
      <div className="relative grid gap-12 border-t border-white/15 px-6 py-20 md:grid-cols-[1fr_1.4fr] md:px-10 md:py-28 lg:px-14">
        <Star className="top-0 left-0" />
        <Reveal>
          <Title k="lp.faqTitle" className="text-[clamp(2.5rem,5.5vw,4.75rem)]" />
        </Reveal>
        <div>
          {FAQ.map((f) => (
            <details key={f.q} className="group border-t border-white/15 py-5 last:border-b">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-serif text-[clamp(1.25rem,2vw,1.6rem)] font-light [&::-webkit-details-marker]:hidden">
                {t(f.q)}
                <PlusIcon className="mt-1.5 size-4 shrink-0 text-white/60 transition-transform duration-300 group-open:rotate-45" />
              </summary>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/70">{t(f.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Closing() {
  const t = useT()
  return (
    <footer className={cn('relative isolate text-white', RAIL)}>
      <Film name="hero" dim="from-black/80 via-black/50" />
      <div className="relative flex min-h-[80svh] flex-col justify-center border-t border-white/15 px-6 py-24 md:px-10 lg:px-14">
        <Star className="top-0 left-0" />
        <Reveal>
          <Title k="lp.closingTitle" />
        </Reveal>
        <Reveal delay={0.15} className="mt-10">
          <CtaButton>{t('lp.cta')}</CtaButton>
        </Reveal>
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-4 border-t border-white/15 bg-black/60 px-6 py-5 md:px-10 lg:px-14">
        <p className={cn(mono, 'text-white/60')}>{t('lp.footer')}</p>
        <div className={cn(mono, 'flex gap-6 text-white/60')}>
          <a href={EXPLORER_CONTRACT_URL} target="_blank" rel="noreferrer" className="hover:text-white">
            {t('lp.footerContract')}
          </a>
          <a href="https://docs.bnbchain.org" target="_blank" rel="noreferrer" className="hover:text-white">
            BNB Chain
          </a>
        </div>
      </div>
    </footer>
  )
}

export function Landing() {
  return (
    <div className="relative bg-[#0b0b0b] font-sans antialiased">
      <Frame />
      <main>
        <Hero />
        <FilmChapter id="model" film="save" tag="lp.modelTag" title="lp.modelTitle" body="lp.modelBody" />
        <FilmChapter id="agents" film="agents" tag="lp.agentsTag" title="lp.agentsTitle" body="lp.agentsBody" />
        <Team />
        <Terms />
        <Questions />
      </main>
      <Closing />
    </div>
  )
}
