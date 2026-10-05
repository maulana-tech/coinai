import { fetchHistory } from '../shared/market.js'
import { backtest, normalizeWeights, POOL_ASSETS, type History, type Weights } from '../shared/pool.js'
import { bearer, body, json } from './_lib/http.js'
import { kv } from './_lib/kv.js'
import { askJson, withUserKeys } from './_lib/llm.js'
import { asLocale, getMarketAnalysis, getProfile } from './_lib/swarm.js'

const LANGUAGE = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' } as const

type Review = { verdict: 'fits' | 'too_risky' | 'too_cautious'; summary: string; suggestion: Weights; reason: string }

// POST { weights: { BNB: 70, BTC: 20, USDT: 10 }, locale } with Authorization: Bearer <token>
// → { review }: the Portfolio Reviewer judges a simulated pool against the investor profile and market.
// Stats are recomputed here from Binance candles; the client's numbers aren't trusted.
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if ((await kv.hit(`rl:pool:${user}`, 3600)) > 20) return json({ error: 'rate_limited' }, 429)

  const input = await body<{ weights: Weights; locale: string }>(req)
  const { weights, valid } = normalizeWeights(input.weights ?? {})
  if (!valid) return json({ error: 'weights_must_total_100' }, 400)
  const locale = asLocale(input.locale)

  try {
    const pairs = POOL_ASSETS.filter((a) => a.pair && weights[a.symbol]).map((a) => a.pair!)
    const raw = await fetchHistory(pairs, 90)
    const history: History = Object.fromEntries(POOL_ASSETS.filter((a) => a.pair && raw[a.pair]).map((a) => [a.symbol, raw[a.pair!]]))
    const stats = backtest(weights, history)
    const perAsset = POOL_ASSETS.filter((a) => a.pair && history[a.symbol]).map((a) => {
      const s = backtest({ [a.symbol]: 100 }, history)
      return { symbol: a.symbol, name: a.name, category: a.category, return90d: round(s.totalReturn), volatility: round(s.volatility), maxDrawdown: round(s.maxDrawdown) }
    })
    const [profile, market] = await Promise.all([getProfile(user), getMarketAnalysis().catch(() => null)])

    const review = await withUserKeys(user, () =>
      askJson<Review>(
        'risk',
        `You are coinAI's Portfolio Reviewer. A saver built a hypothetical pool (a simulation, nothing is bought) from crypto,
tokenized US stocks (Binance 24/7 tokens that track the share price, e.g. AAPL, SPY), tokenized gold (PAXG) and stablecoin (USDT).
Judge it against their investor profile and the current market read. Be concrete and calm; cite the numbers.
- verdict: "fits" if risk matches the profile, "too_risky" if volatility/drawdown/concentration exceed it, "too_cautious" if a long-horizon aggressive saver holds mostly stablecoin.
- Concentration above 60% in one volatile coin or one single stock is a red flag for conservative or short-horizon savers.
- Diversifying across categories (crypto, stocks, ETFs, gold, stablecoin) lowers risk; ETFs (SPY, QQQ broad indexes; SMH is a narrower chip sector ETF) are steadier than single stocks; gold and stablecoin are the calm part.
- In a risk_off market, favour more stablecoin; in risk_on, some more growth is reasonable for aggressive profiles.
- suggestion: an improved allocation over the same asset list (${POOL_ASSETS.map((a) => a.symbol).join(', ')}), integer percents summing to 100. Keep it close to the user's pool when it already fits.
- Never promise returns. This is not financial advice.
- Speak to a saver, not a trader: say "the market is trending up / mixed / falling", never internal codes like risk_on or risk_off.
Write "summary" (<=280 chars) and "reason" (<=200 chars) in ${LANGUAGE[locale]}, plain text, no markdown.
JSON shape: {"verdict":"fits"|"too_risky"|"too_cautious","summary":"...","suggestion":{"BNB":0-100,...},"reason":"..."}`,
        { pool: weights, poolStats90d: { totalReturn: round(stats.totalReturn), volatility: round(stats.volatility), maxDrawdown: round(stats.maxDrawdown) }, perAsset, investorProfile: profile, marketAnalysis: market },
      ),
    )
    const suggestion = normalizeWeights(review.suggestion ?? {})
    return json({
      review: {
        verdict: ['fits', 'too_risky', 'too_cautious'].includes(review.verdict) ? review.verdict : 'fits',
        summary: clean(review.summary, locale).slice(0, 400),
        reason: clean(review.reason, locale).slice(0, 300),
        suggestion: suggestion.valid ? suggestion.weights : null,
      },
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}

const round = (x: number) => Math.round(x * 10) / 10
// Free models occasionally leak Chinese characters into English/Indonesian replies.
// and internal regime codes (risk_on / risk_off) despite the prompt; say it in plain words instead.
const REGIME_WORDS: Record<string, [string, string, string]> = {
  en: ['an uptrending market', 'a falling market', 'a mixed market'],
  id: ['pasar yang sedang naik', 'pasar yang sedang turun', 'pasar yang campur'],
  zh: ['上涨的市场', '下跌的市场', '震荡的市场'],
}
const clean = (text: unknown, locale: string) => {
  const [up, down, mixed] = REGIME_WORDS[locale] ?? REGIME_WORDS.en
  const s = String(text ?? '')
    .replace(/(kondisi |the )?risk[_ -]on( market)?/gi, up)
    .replace(/(kondisi |the )?risk[_ -]off( market)?/gi, down)
    .replace(/\bneutral market\b/gi, mixed)
  return locale === 'zh' ? s : s.replace(/[\u3000-\u9fff\uff00-\uffef]+/g, '').replace(/ {2,}/g, ' ')
}
