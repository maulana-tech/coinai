import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { motion } from 'motion/react'

function GlitchText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`group relative inline-block cursor-default ${className}`}>
      <span className="relative z-10 block transition-transform duration-300 group-hover:scale-105">{text}</span>
      <span 
        className="absolute inset-0 z-0 block opacity-0 text-red-500 translate-x-[2px] animate-glitch-1 group-hover:opacity-100 mix-blend-screen transition-opacity duration-300"
        aria-hidden="true"
      >
        {text}
      </span>
      <span 
        className="absolute inset-0 z-0 block opacity-0 text-blue-500 -translate-x-[2px] animate-glitch-2 group-hover:opacity-100 mix-blend-screen transition-opacity duration-300"
        aria-hidden="true"
      >
        {text}
      </span>
    </div>
  )
}

export function LandingHero() {
  const t = useT()
  
  // Split the subtitle for a stagger reveal effect
  const subtitleWords = t('landing.heroTitle').split(' ')

  return (
    <section className="relative isolate z-20 flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-12 sm:px-12 sm:pt-32" id="top">
      {/* Restored Original Background */}
      <img className="absolute inset-0 z-[-3] h-full w-full object-cover opacity-40 mix-blend-luminosity" src="/assets/section1-bg.png" alt="" />
      <div className="pointer-events-none absolute inset-0 z-[-2] bg-[radial-gradient(48%_56%_at_50%_47%,rgba(9,13,22,0.6),rgba(9,13,22,0.1)_76%),linear-gradient(to_bottom,rgba(29,34,21,0.6),transparent_22%,transparent_60%,rgba(9,13,22,0.7))]" aria-hidden="true" />

      {/* Floating hands decoration with entrance animation */}
      <div className="pointer-events-none absolute inset-0 z-[-1] opacity-80 mix-blend-screen" aria-hidden="true">
        <div className="absolute left-0 top-1/2 origin-left -translate-y-[46%] max-lg:-translate-y-[58%] max-lg:scale-90 max-[620px]:opacity-40">
          <motion.img 
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="block h-auto w-[min(46vw,600px)] [filter:drop-shadow(0_26px_40px_rgba(0,0,0,0.55))] max-lg:w-[62vw] max-[620px]:w-[76vw]" 
            src="/assets/left-hand.png" 
            alt="" 
            fetchPriority="low"
            decoding="async"
          />
        </div>
        <div className="absolute right-0 top-1/2 origin-right -translate-y-[40%] max-lg:-translate-y-[16%] max-lg:scale-90 max-[620px]:opacity-40">
          <motion.img 
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="block h-auto w-[min(46vw,600px)] [filter:drop-shadow(0_26px_40px_rgba(0,0,0,0.55))] max-lg:w-[62vw] max-[620px]:w-[76vw]" 
            src="/assets/right-hand.png" 
            alt="" 
            fetchPriority="low"
            decoding="async"
          />
        </div>
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="mb-6 overflow-hidden rounded-full border border-white/20 bg-white/5 px-4 py-1.5 backdrop-blur-md">
            <span className="text-xs font-semibold tracking-[0.2em] text-white/80 uppercase" style={{ fontFamily: "'Space Mono', monospace" }}>
              Welcome to the Future
            </span>
          </div>
          
          <h1 className="flex flex-col items-center text-balance text-5xl font-bold tracking-tight text-white sm:text-7xl lg:text-[6rem] leading-[1.05]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            <GlitchText text="Confidential" />
            <GlitchText text="FXRP Savings" />
          </h1>
        </motion.div>

        <motion.p 
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.05, delayChildren: 0.5 }
            }
          }}
          className="mt-6 flex max-w-xl flex-wrap justify-center gap-[1ex] text-lg font-medium leading-relaxed text-slate-300 sm:text-xl md:mt-8"
        >
          {subtitleWords.map((word, i) => (
            <motion.span 
              key={i} 
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0 }
              }}
            >
              {word}
            </motion.span>
          ))}
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4 md:mt-12"
        >
          <Link className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-white px-8 text-[15px] font-semibold text-black transition-transform hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.15)]" to="/app">
            <span className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:animate-liquid-shimmer" />
            <span className="relative z-10">{t('landing.cta')}</span>
          </Link>
          <a className="inline-flex h-14 items-center justify-center rounded-full border border-slate-600 bg-slate-900/60 px-8 text-[15px] font-semibold text-white backdrop-blur transition-all hover:border-white/50 hover:bg-slate-800" href="#about">
            {t('landing.navCompare')}
          </a>
        </motion.div>
        
        {/* Navigation links at the bottom */}
        <motion.ul 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="mt-20 flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
        >
          {[
            { label: t('landing.navCompare'), href: '#about' },
            { label: t('landing.navHow'), href: '#features' },
            { label: t('landing.navProtocols'), href: '#protocols' },
          ].map((item) => (
            <li key={item.href}>
              <a href={item.href} className="group relative text-sm font-semibold tracking-wide text-slate-400 transition-colors hover:text-white uppercase" style={{ fontFamily: "'Space Mono', monospace" }}>
                {item.label}
                <span className="absolute -bottom-1 left-0 h-[1px] w-0 bg-white transition-all duration-300 group-hover:w-full" />
              </a>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  )
}
