// Run: npx tsx --test api/_lib/og.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { escapeHtml, ogDescription, ogPage, type OgFund } from './og.ts'

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
  assert.match(html, /<meta property="og:image" content="https:\/\/coinai.example\/landing\/agents.jpg" \/>/)
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
