import { body, json, login } from './_lib/http.js'

// POST { address, issuedAt, signature } → { token }
export async function POST(req: Request) {
  const { address, issuedAt, signature } = await body<{ address: string; issuedAt: number; signature: string }>(req)
  try {
    return json({ token: login(String(address), Number(issuedAt), String(signature)) })
  } catch (e) {
    return json({ error: (e as Error).message }, 401)
  }
}
