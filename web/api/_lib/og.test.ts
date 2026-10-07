// Run: npx tsx --test api/_lib/og.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { escapeHtml, ogDescription, ogGoalPage, ogPage, type OgFund } from './og.ts'
import { goalCard, ogCard, ogStatus } from './og-image.ts'

const base: OgFund = { kind: 'patungan', title: 'Bukber Angkatan 2019', cancelled: false, deadline: 1_792_000_000, period: 0, target: 120_000_000n, dues: 0n, raised: 80_000_000n, contributors: 3, members: 0 }

test('one-line summaries per kind', () => {
  assert.match(ogDescription(base), /^Patungan · 80 tUSDT dari 120 tUSDT terkumpul · 3 penyumbang · tenggat /)
  assert.match(ogDescription({ ...base, kind: 'iuran', target: 0n, dues: 10_000_000n, period: 30 * 86_400, members: 3, raised: 30_000_000n }), /^Iuran 10 tUSDT tiap 30 hari · 3 anggota · 30 tUSDT terkumpul/)
  assert.match(ogDescription({ ...base, kind: 'donasi', target: 0n }), /^Donasi · 80 tUSDT terkumpul · 3 penyumbang/)
  assert.match(ogDescription({ ...base, cancelled: true }), /dibatalkan/)
})

test('the page carries the preview tags and sends people on to the group', () => {
  const html = ogPage(base, 1, 'https://coinai.example')
  assert.match(html, /<meta property="og:title" content="Bukber Angkatan 2019 · coinAI" \/>/)
  assert.match(html, /<meta property="og:image" content="https:\/\/coinai.example\/g\/1\/image.png\?v=80000000-3-0-0" \/>/)
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/)
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/)
  assert.match(html, /content="0;url=\/groups\/1"/)
  assert.match(html, /location.replace\("\/groups\/1"\)/)
})

test('a user-written title cannot inject markup', () => {
  const html = ogPage({ ...base, title: '"><script>alert(1)</script>' }, 2, 'https://coinai.example')
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
})

test('an unknown group still gets a generic preview', () => {
  assert.match(ogPage(null, 9, 'https://coinai.example'), /<title>coinAI · Dana grup<\/title>/)
})

test('the preview card shows the live numbers and the app status', () => {
  const c = ogCard(base)
  assert.equal(c.label, 'PATUNGAN')
  assert.equal(c.amount, '80 tUSDT')
  assert.equal(c.amountOf, 'dari 120 tUSDT')
  assert.equal(c.progress, 0.666)
  assert.equal(c.done, false)
  assert.match(c.meta, /^3 penyumbang · tenggat /)
  assert.equal(ogStatus(base, base.deadline - 1), 'Terbuka')
  assert.equal(ogStatus(base, base.deadline + 1), 'Gagal')
  assert.equal(ogStatus({ ...base, raised: 120_000_000n }), 'Tercapai')
  assert.equal(ogStatus({ ...base, kind: 'donasi', deadline: 0 }), 'Terbuka')
  assert.equal(ogCard({ ...base, kind: 'iuran', target: 0n, dues: 10_000_000n, period: 30 * 86_400, members: 3 }).meta, '10 tUSDT tiap 30 hari · 3 anggota')
})

test('a shared goal previews its progress and sends people to the owner\'s payment link', () => {
  const user = '0x2Cf3000000000000000000000000000000000001'
  const goal = { name: 'Buy Macbook', target: 1000, deadline: 1_798_000_000, saved: 250 }
  const html = ogGoalPage(goal, user, 'g1', 'https://coinai.example')
  assert.match(html, /<meta property="og:title" content="Buy Macbook · coinAI" \/>/)
  assert.match(html, /Menabung untuk Buy Macbook: 250 tUSDT dari 1.000 tUSDT \(25%\)/)
  assert.match(html, /og:image" content="https:\/\/coinai.example\/goal\/0x2Cf3[0-9]+1\/g1\/image.png\?v=25000-1000"/)
  assert.match(html, new RegExp(`location.replace\\("/pay/${user}"\\)`))
  assert.match(ogGoalPage(null, user, 'g1', 'https://coinai.example'), /Target tabungan/)
  const c = goalCard(goal, 1_798_000_000 - 10 * 86_400)
  assert.equal(c.status, '10 hari lagi')
  assert.equal(c.progress, 0.25)
  assert.equal(goalCard({ ...goal, saved: 1200 }).status, 'Tercapai')
  assert.equal(goalCard({ ...goal, deadline: 0 }).status, 'Tanpa tenggat')
})
