import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Locale = 'en' | 'id' | 'zh'
export type PrimaryCurrency = 'usd' | 'idr' | 'fxrp' | 'cny'

type SettingsContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  primaryCurrency: PrimaryCurrency
  setPrimaryCurrency: (currency: PrimaryCurrency) => void
}

const LOCALE_KEY = 'coinai:locale'
const CURRENCY_KEY = 'coinai:currency'

const SettingsContext = createContext<SettingsContextValue | null>(null)

function initialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY)
  if (stored === 'en' || stored === 'id' || stored === 'zh') return stored
  return 'en'
}

// the fiat shown alongside a FXRP-primary display follows the chosen
// language, so a Chinese speaker sees CNY rather than defaulting to USD
export function secondaryCurrencyFor(primary: PrimaryCurrency, locale: Locale): PrimaryCurrency {
  if (primary !== 'fxrp') return 'fxrp'
  if (locale === 'zh') return 'cny'
  if (locale === 'id') return 'idr'
  return 'usd'
}

function initialCurrency(): PrimaryCurrency {
  const stored = localStorage.getItem(CURRENCY_KEY)
  if (stored === 'usd' || stored === 'idr' || stored === 'fxrp' || stored === 'cny') return stored
  return 'fxrp'
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const [primaryCurrency, setCurrencyState] = useState<PrimaryCurrency>(initialCurrency)

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(LOCALE_KEY, next)
    setLocaleState(next)
  }, [])

  const setPrimaryCurrency = useCallback((next: PrimaryCurrency) => {
    localStorage.setItem(CURRENCY_KEY, next)
    setCurrencyState(next)
  }, [])

  const value = useMemo(
    () => ({ locale, setLocale, primaryCurrency, setPrimaryCurrency }),
    [locale, setLocale, primaryCurrency, setPrimaryCurrency],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
