import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useLenis } from 'lenis/react'
import { ArrowUpRightIcon } from 'lucide-react'
import { DEPLOYMENT } from '../../../shared/deployment.js'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/config'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Reveal, Star, Title } from './kit'
import { mono } from './styles'

// "The council": the team as gods at one long table (public/council.mp4, poster council.webp). The section pins while you scroll;
// each step pans the painting to one agent, lights them and opens their card. Scroll is the only driver (the
// index below just scrolls to a step), so the camera and the card never disagree.

// public/council.mp4: the painting brought to life (Higgsfield, static camera), cropped back to the painting's
// framing; council.webp is its first frame. Face coordinates below are % of this frame.
const ART = { src: '/council.webp', film: '/council.mp4', w: 1600, h: 942 }
const AGENT_WALLET = DEPLOYMENT.v2.agent // the agent wallet, also the basket curator
const CHAINLINK_BNB_USD = '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526'

type Id = 'zeus' | 'apollo' | 'demeter' | 'athena' | 'perseus' | 'hades' | 'heracles' | 'nyx' | 'percy' | 'plutus' | 'hermes' | 'poseidon'
type Part = 'Myth' | 'Task' | 'When' | 'Chips'
const copy = (id: Id, part: Part) => `council.${id}${part}` satisfies MessageKey

type Fact = { label: MessageKey } & ({ name: string; address: string } | { tx: string } | { code: string } | { text: MessageKey })

type Agent = {
  id: Id
  name: string
  role: MessageKey
  engine: 'llm' | 'code' | 'contract'
  status: 'live' | 'v2' // v2: the contract is live, the app doesn't drive it yet
  head: [number, number] // the face, % of the painting
  facts: Fact[]
}

const COINAI = { name: 'coinAI v2', address: DEPLOYMENT.v2.coinai }

// In the order a run flows through the team, then the v2 agents.
const COUNCIL: Agent[] = [
  {
    id: 'zeus',
    name: 'Zeus',
    role: 'council.roleOrchestrator',
    engine: 'code',
    status: 'live',
    head: [50.2, 37.2],
    facts: [
      { label: 'council.wallet', name: 'coinAI agent', address: AGENT_WALLET },
      { label: 'council.contract', ...COINAI },
    ],
  },
  {
    id: 'apollo',
    name: 'Apollo',
    role: 'agent.roleMarket',
    engine: 'llm',
    status: 'live',
    head: [21.3, 34.8],
    facts: [{ label: 'council.reads', name: 'Chainlink BNB/USD', address: CHAINLINK_BNB_USD }],
  },
  {
    id: 'demeter',
    name: 'Demeter',
    role: 'agent.roleSavings',
    engine: 'llm',
    status: 'live',
    head: [5.1, 32.5],
    facts: [
      { label: 'council.calls', code: 'agentSetSplit()' },
      { label: 'council.contract', ...COINAI },
      { label: 'council.listed', tx: '0xb033763f9b5825b08d293362f826582a5e3fdf1a4a0eb80fdb0886aee3eee8c9' },
    ],
  },
  {
    id: 'athena',
    name: 'Athena',
    role: 'agent.roleInvestment',
    engine: 'llm',
    status: 'live',
    head: [83.2, 33.6],
    facts: [
      { label: 'council.calls', code: 'agentInvest()' },
      { label: 'council.contract', ...COINAI },
      { label: 'council.listed', tx: '0x1433229183d880a46faa1fb431004c88395059e3f4856765558c0c16c66179f3' },
    ],
  },
  {
    id: 'perseus',
    name: 'Perseus',
    role: 'agent.roleGuard',
    engine: 'code',
    status: 'live',
    head: [88.3, 27.8],
    facts: [{ label: 'council.mirrors', ...COINAI }],
  },
  {
    id: 'hades',
    name: 'Hades',
    role: 'agent.roleRisk',
    engine: 'llm',
    status: 'live',
    head: [16.2, 23],
    facts: [{ label: 'council.keys', text: 'council.noKeys' }],
  },
  {
    id: 'heracles',
    name: 'Heracles',
    role: 'agent.roleExecutor',
    engine: 'code',
    status: 'live',
    head: [77.1, 37.2],
    facts: [
      { label: 'council.wallet', name: 'coinAI agent', address: AGENT_WALLET },
      { label: 'council.contract', ...COINAI },
    ],
  },
  {
    id: 'nyx',
    name: 'Nyx',
    role: 'agent.roleReporter',
    engine: 'llm',
    status: 'live',
    head: [61.4, 38.4],
    facts: [{ label: 'council.keys', text: 'council.noKeys' }],
  },
  {
    id: 'percy',
    name: 'Percy',
    role: 'council.roleChat',
    engine: 'llm',
    status: 'live',
    head: [28.4, 38.4],
    facts: [
      { label: 'council.calls', code: 'run_agent_team()' },
      { label: 'council.keys', text: 'council.noKeys' },
    ],
  },
  {
    id: 'plutus',
    name: 'Plutus',
    role: 'council.roleSmartMoney',
    engine: 'llm',
    status: 'live',
    head: [11.7, 36],
    facts: [
      { label: 'council.calls', code: 'setSmartWeights()' },
      { label: 'council.contract', name: 'BasketVault', address: DEPLOYMENT.v2.basketVault },
      { label: 'council.deployTx', tx: '0x8fe9fa0d4a35a888c7a75dd727ed0d8553573dd81f0a7e068461b33f96df18fb' },
    ],
  },
  {
    id: 'hermes',
    name: 'Hermes',
    role: 'council.rolePay',
    engine: 'code',
    status: 'live',
    head: [36.5, 39.5],
    facts: [
      { label: 'council.calls', code: 'agentContribute()' },
      { label: 'council.contract', name: 'coinAI v2', address: DEPLOYMENT.v2.coinai },
      { label: 'council.listed', tx: '0xfa0942985959608402f10e88ff029cb36a788350ec88b288d943e4228bc06747' },
    ],
  },
  {
    id: 'poseidon',
    name: 'Poseidon',
    role: 'council.roleGroups',
    engine: 'contract',
    status: 'live',
    head: [72.1, 38.4],
    facts: [
      { label: 'council.contract', name: 'GroupFunds', address: DEPLOYMENT.v2.groupFunds },
      { label: 'council.deployTx', tx: '0xf55283fbe20a4f8c4356e9554d6381cdfe91f93dd8b2a64092dce74b98c8df32' },
    ],
  },
]

const N = COUNCIL.length
const STEP_VH = 55 // scroll per agent (and for the opening view)
const SPRING = { stiffness: 55, damping: 20, mass: 1 }
const ENGINE: Record<Agent['engine'], MessageKey> = { llm: 'council.engineLlm', code: 'council.engineCode', contract: 'council.engineContract' }

const pad = (n: number) => String(n).padStart(2, '0')
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type View = { x: number; y: number; s: number; bw: number; bh: number }

/** Where the painting sits: covering the stage, and on a step zoomed in with the agent on the side away from the card. */
function frame(w: number, h: number, focus: Agent | null): View {
  const bw = Math.max(w, (h * ART.w) / ART.h)
  const bh = (bw * ART.h) / ART.w
  if (!focus) return { x: (w - bw) / 2, y: (h - bh) / 2, s: 1, bw, bh }
  const wide = w >= 768
  const s = wide ? 1.4 : 1.1
  const [fx, fy] = focus.head
  const tx = wide ? (fx < 50 ? 0.34 : 0.66) * w : 0.5 * w
  const ty = (wide ? 0.42 : 0.3) * h
  return {
    x: clamp(tx - (fx / 100) * bw * s, w - bw * s, 0),
    y: clamp(ty - ((fy + 6) / 100) * bh * s, h - bh * s, 0),
    s,
    bw,
    bh,
  }
}

/** A face's marker is shown only where it can be read: not under the top bar or the rail, not off an edge. */
function markerFits(a: Agent, v: View, w: number) {
  const wide = w >= 768
  const x = v.x + (a.head[0] / 100) * v.bw * v.s
  const y = v.y + ((a.head[1] - 7) / 100) * v.bh * v.s // the marker's bottom; it is ~22px tall
  return x > (wide ? 80 : 0) + 36 && x < w - 36 && y - 24 > (wide ? 80 : 64)
}

export function Council() {
  const t = useT()
  const reduced = useReducedMotion() ?? false
  const lenis = useLenis()
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [step, setStep] = useState(-1) // -1: the opening view of the whole table

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (p) => setStep(Math.min(N - 1, Math.floor(p * (N + 1)) - 1)))

  const agent = step >= 0 ? COUNCIL[step] : null
  const view = useMemo(() => (size ? frame(size.w, size.h, agent) : null), [size, agent])

  // camera + spotlight, as springs so every move is one continuous pan
  const x = useSpring(0, SPRING)
  const y = useSpring(0, SPRING)
  const s = useSpring(1, SPRING)
  const sx = useSpring(50, SPRING)
  const sy = useSpring(40, SPRING)
  const dim = useSpring(0, { stiffness: 80, damping: 24 })
  const inverse = useTransform(s, (v) => 1 / v)
  const spot = useMotionTemplate`radial-gradient(ellipse 10% 26% at ${sx}% ${sy}%, rgba(8,8,8,0) 0%, rgba(8,8,8,0) 40%, rgba(8,8,8,0.74) 100%)`
  const placed = useRef(false)

  useEffect(() => {
    if (!view) return
    const put = (mv: MotionValue<number>, v: number) => (reduced || !placed.current ? mv.jump(v) : mv.set(v))
    put(x, view.x)
    put(y, view.y)
    put(s, view.s)
    if (agent) {
      put(sx, agent.head[0])
      put(sy, agent.head[1] + 5)
    }
    put(dim, agent ? 1 : 0)
    placed.current = true
  }, [view, agent, reduced, x, y, s, sx, sy, dim])

  // the card goes on the side away from the agent (phones: always below)
  const side = view && agent && size && view.x + (agent.head[0] / 100) * view.bw * view.s > size.w / 2 ? 'left' : 'right'

  /** Scroll to the middle of agent i's step. */
  const go = (i: number) => {
    const el = sectionRef.current
    const stage = stageRef.current
    if (!el || !stage) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const target = top + ((el.offsetHeight - stage.offsetHeight) * (i + 1.5)) / (N + 1)
    if (lenis) lenis.scrollTo(target, { duration: reduced ? 0 : 1.4 })
    else window.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' })
  }

  const layer = view && { x, y, scale: s, width: view.bw, height: view.bh }

  return (
    <section id="team" ref={sectionRef} className="relative bg-[#0b0b0b] text-white" style={{ height: `calc(100svh + ${(N + 1) * STEP_VH}svh)` }}>
      <div ref={stageRef} className="sticky top-0 h-svh overflow-hidden">
        {layer && (
          <motion.div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 origin-top-left will-change-transform" style={layer}>
            {reduced ? (
              <img src={ART.src} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full select-none" />
            ) : (
              <video src={ART.film} poster={ART.src} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
            )}
            <motion.div className="absolute inset-0" style={{ background: spot, opacity: dim }} />
          </motion.div>
        )}

        {/* legibility: header and index bands, plus the opening view's left fade */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent via-30% to-black/70" />
        <motion.div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent"
          animate={{ opacity: agent ? 0 : 1 }}
          transition={{ duration: reduced ? 0 : 0.8 }}
        />

        {/* who's who: a marker over each face, moving with the painting */}
        {layer && (
          <motion.div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 origin-top-left" style={layer}>
            {COUNCIL.map((a, i) => {
              const on = step === i
              const fits = !!view && !!size && markerFits(a, view, size.w)
              return (
                <motion.span
                  key={a.id}
                  className={cn('absolute flex origin-bottom -translate-x-1/2 -translate-y-full transition-opacity duration-500', !fits && 'opacity-0')}
                  style={{ left: `${a.head[0]}%`, top: `${a.head[1] - 7}%`, scale: inverse }}
                >
                  <span
                    className={cn(
                      mono,
                      'flex items-center gap-1.5 rounded-[3px] border px-2 py-1 whitespace-nowrap backdrop-blur-sm transition-colors duration-500',
                      on ? 'border-white/60 bg-[#0b0b0b]/80 text-white' : 'border-white/15 bg-black/35 text-white/60',
                    )}
                  >
                    <span>✦</span>
                    {on ? a.name : pad(i + 1)}
                  </span>
                </motion.span>
              )
            })}
          </motion.div>
        )}

        {/* opening view: the title, like the chapters above */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-12 md:left-[80px] md:pb-24"
          animate={{ opacity: agent ? 0 : 1, y: agent ? 16 : 0 }}
          transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative border-t border-white/15 px-6 pt-10 md:px-10 lg:px-14">
            <Star className="top-0 left-0" />
            {/* margin 0: the stage is pinned, so a shrunk viewport would never be entered */}
            <Reveal margin="0px">
              <p className={cn(mono, 'mb-6 text-white/60')}>{t('lp.teamTag')}</p>
              <Title k="lp.teamTitle" className="text-[clamp(2.5rem,5.5vw,4.75rem)]" />
            </Reveal>
            <Reveal margin="0px" delay={0.15} className="mt-8 flex flex-col gap-4 md:flex-row md:items-start md:gap-12">
              <span className={cn(mono, 'shrink-0 self-start rounded-[3px] border border-white/25 bg-black/40 px-3 py-1.5 text-white/80')}>{t('council.count', { n: N })}</span>
              <p className="max-w-md text-[15px] leading-relaxed text-white/85">{t('council.hint')}</p>
            </Reveal>
          </div>
        </motion.div>

        <AnimatePresence>{agent && <AgentCard key={agent.id} agent={agent} index={step} side={side} reduced={reduced} />}</AnimatePresence>

        {/* index: one tick per agent, filling as you scroll; click to jump there */}
        <nav aria-label={t('council.index')} className="absolute inset-x-0 bottom-0 z-20 hidden border-t border-white/15 bg-black/30 backdrop-blur-[2px] md:left-[80px] md:flex">
          {COUNCIL.map((a, i) => (
            <button
              key={a.id}
              type="button"
              aria-label={`${a.name}, ${t(a.role)}`}
              aria-current={step === i ? 'step' : undefined}
              className={cn(
                mono,
                'relative flex-1 px-2 py-4 text-left transition-colors outline-none focus-visible:bg-white/10 lg:px-3',
                step === i ? 'text-white' : 'text-white/45 hover:text-white/80',
              )}
              onClick={() => go(i)}
            >
              <span className={cn('absolute top-[-1px] left-0 h-px bg-white transition-all duration-700', step >= i ? 'w-full' : 'w-0')} />
              {pad(i + 1)}
              <span className="ml-2 hidden tracking-[0.16em] xl:inline">{a.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* the same team as plain text, for screen readers and search */}
      <ol className="sr-only">
        {COUNCIL.map((a) => (
          <li key={a.id}>
            {a.name}, {t(a.role)}: {t(copy(a.id, 'Task'))}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * One agent, in the landing's own language: ink panel, hairlines, mono labels, light serif. On short desktop
 * windows (laptops, ≤820px tall) it drops the myth line and the engine/when rows so it stays between the top bar
 * and the index.
 */
function AgentCard({ agent: a, index, side, reduced }: { agent: Agent; index: number; side: 'left' | 'right'; reduced: boolean }) {
  const t = useT()
  const live = a.status === 'live'
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, transition: { duration: reduced ? 0 : 0.25 } }}
      transition={{ duration: reduced ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'absolute inset-x-3 bottom-3 z-30 rounded-[3px] border border-white/15 bg-[#0b0b0b]/75 p-5 text-white shadow-2xl shadow-black/50 backdrop-blur-md sm:inset-x-4 sm:bottom-4',
        'md:inset-x-auto md:top-[calc(50%+12px)] md:bottom-auto md:w-[420px] md:-translate-y-1/2 md:p-7 md:[@media(max-height:820px)]:p-5',
        side === 'right' ? 'md:right-8 lg:right-12' : 'md:left-[112px] lg:left-[128px]',
      )}
    >
      <Star className="top-0 left-0" />
      <div className="flex items-center justify-between gap-3">
        <span className={cn(mono, 'whitespace-nowrap text-white/45')}>
          {pad(index + 1)} / {pad(N)}
        </span>
        <span className={cn(mono, 'inline-flex items-center gap-2 whitespace-nowrap max-sm:tracking-[0.16em]', live ? 'text-[#8fc9a3]' : 'text-[#d5aa61]')}>
          <span className={cn('size-1.5 rounded-full', live ? 'bg-[#8fc9a3]' : 'bg-[#d5aa61]')} />
          {t(live ? 'council.statusLive' : 'council.statusV2')}
        </span>
      </div>

      <p className={cn(mono, 'mt-5 text-white/55 md:mt-7 md:[@media(max-height:820px)]:mt-4')}>{t(a.role)}</p>
      <h3 className="mt-2 font-serif text-[2.6rem] leading-[0.95] font-light tracking-[-0.02em] md:text-[3.4rem] md:[@media(max-height:820px)]:text-[2.6rem]">{a.name}</h3>
      <p className="mt-2 hidden font-serif text-lg leading-snug font-light text-white/65 italic sm:block md:[@media(max-height:820px)]:hidden">{t(copy(a.id, 'Myth'))}</p>
      <p className="mt-4 text-[13px] leading-relaxed text-white/80 md:mt-5 md:text-[14px] md:[@media(max-height:820px)]:mt-3 md:[@media(max-height:820px)]:text-[13px]">{t(copy(a.id, 'Task'))}</p>

      <ul className="mt-4 flex flex-wrap gap-1.5 md:mt-5 md:[@media(max-height:820px)]:mt-3">
        {t(copy(a.id, 'Chips'))
          .split('|')
          .map((c) => (
            <li key={c} className={cn(mono, 'rounded-[3px] border border-white/25 bg-black/40 px-2.5 py-1 tracking-[0.18em] text-white/80')}>
              {c}
            </li>
          ))}
      </ul>

      <dl className="mt-5 border-t border-white/15 text-[13px] md:mt-6 md:[@media(max-height:820px)]:mt-4">
        <Row label={t('council.engine')} className="max-md:hidden md:[@media(max-height:820px)]:hidden">
          {t(ENGINE[a.engine])}
        </Row>
        <Row label={t('council.when')} className="max-md:hidden md:[@media(max-height:820px)]:hidden">
          {t(copy(a.id, 'When'))}
        </Row>
        {a.facts.map((f) => (
          <Row key={f.label} label={t(f.label)}>
            {'address' in f ? (
              <a href={explorerAddressUrl(f.address)} target="_blank" rel="noreferrer" className="group inline-flex flex-wrap items-baseline gap-x-1.5 text-white/90 hover:text-white">
                {f.name}
                <span className="font-mono text-[11px] text-white/45 group-hover:text-white/70">{short(f.address)}</span>
                <ArrowUpRightIcon className="size-3 self-center text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </a>
            ) : 'tx' in f ? (
              <a href={explorerTxUrl(f.tx)} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-white/75 hover:text-white">
                {short(f.tx)}
                <ArrowUpRightIcon className="size-3 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white" />
              </a>
            ) : 'code' in f ? (
              <code className="font-mono text-[11px] text-[#d5aa61]">{f.code}</code>
            ) : (
              <span className="text-white/60">{t(f.text)}</span>
            )}
          </Row>
        ))}
      </dl>
    </motion.article>
  )
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[6.25rem_minmax(0,1fr)] items-baseline gap-3 border-b border-white/10 py-2.5 last:border-b-0', className)}>
      <dt className={cn(mono, 'text-white/40')}>{label}</dt>
      <dd className="min-w-0 text-white/85">{children}</dd>
    </div>
  )
}
