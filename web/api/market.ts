import { json } from './_lib/http.js'
import { getMarket, getMarketAnalysis } from './_lib/swarm.js'

// GET → { market, analysis } — public; both are cached (5 min / 30 min) and shared by all users.
export async function GET() {
  try {
    const market = await getMarket()
    const analysis = await getMarketAnalysis(market).catch(() => null) // no LLM configured → board still works
    return json({ market, analysis })
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
}
