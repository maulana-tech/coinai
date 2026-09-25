import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { LogoMark } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

export function LandingHeader() {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header 
      className={`fixed inset-x-0 top-0 z-[70] flex items-center justify-between px-6 py-4 md:px-12 border-b transition-all duration-300 ${
        scrolled 
          ? 'border-border/40 bg-background/85 backdrop-blur-md' 
          : 'border-transparent bg-transparent'
      }`}
    >
      <Link className="flex items-center gap-2.5 outline-none group" to="/">
        <LogoMark size={28} forceDark={!scrolled} className="transition-transform group-hover:scale-105" />
        <span className={`text-xl font-bold tracking-tight transition-colors ${scrolled ? 'text-foreground' : 'text-white'}`}>coinAI</span>
      </Link>
      <div className="flex items-center gap-4 sm:gap-6">
        <nav className={`hidden items-center gap-6 text-[15px] font-semibold tracking-wide uppercase sm:flex transition-colors ${scrolled ? 'text-muted-foreground' : 'text-white/80'}`} style={{ fontFamily: "'Space Mono', monospace" }}>
          <a href="#about" className={`transition-colors ${scrolled ? 'hover:text-foreground' : 'hover:text-white'}`}>{t('landing.navCompare')}</a>
          <a href="#features" className={`transition-colors ${scrolled ? 'hover:text-foreground' : 'hover:text-white'}`}>{t('landing.navHow')}</a>
          <a href="#protocols" className={`transition-colors ${scrolled ? 'hover:text-foreground' : 'hover:text-white'}`}>{t('landing.navProtocols')}</a>
        </nav>
        <Button asChild size="sm" className={`rounded-full px-6 font-semibold shadow-md transition-all hover:scale-105 ${scrolled ? '' : 'bg-white text-black hover:bg-slate-100'}`}>
          <Link to="/app">{t('landing.cta')}</Link>
        </Button>
      </div>
    </header>
  )
}
