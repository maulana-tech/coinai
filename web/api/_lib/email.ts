// Daily report email: a statement-style HTML layout (tables + inline CSS so it renders in
// Gmail, Outlook and mobile clients) plus a plain-text fallback. Everything that comes from an
// LLM or the chain is escaped before it goes into HTML.

import type { MarketSnapshot } from '../../shared/market.js'
import { explorerTx, type UserState } from './chain.js'
import type { Target } from './guard.js'
import type { Locale, RunResult } from './swarm.js'

const C = {
  bg: '#eee8d8',
  card: '#ffffff',
  ink: '#193d2d',
  primary: '#1c4934',
  muted: '#5f6f63',
  line: '#e4ddcc',
  soft: '#f6f2e8',
  gold: '#b8893a',
  up: '#2f7a4f',
  down: '#b3412f',
}
const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const MONO = "'SFMono-Regular', Menlo, Consolas, monospace"

export const EMAIL_LABELS = {
  en: {
    subject: 'Your coinAI daily report',
    kicker: 'Daily report',
    summary: 'Summary',
    total: 'Total balance',
    spendable: 'Spendable',
    idle: 'Idle savings',
    invested: 'Invested',
    split: 'of every payment goes to savings',
    holdings: 'Your vaults',
    notInvested: 'Nothing invested yet.',
    market: 'Market read',
    regime: { risk_on: 'Risk-on', neutral: 'Neutral', risk_off: 'Risk-off' },
    marketSource: 'Spot prices from Chainlink on BNB Smart Chain · 24h and 7d change from Binance',
    actions: 'What your agents did',
    noActions: 'No on-chain changes today.',
    splitAction: 'Savings split updated',
    investAction: 'Savings invested in a vault',
    viewTx: 'View on BscScan',
    note: "Reporter's note",
    reminders: 'Reminders',
    cta: 'Open the app',
    footer: 'BNB Smart Chain testnet demo — tokens have no real value. Manage notifications in the app under AI Agent → Daily report & reminders.',
    vault: { conservative: 'Conservative', balanced: 'Balanced', growth: 'Growth' },
    apy: 'APY',
  },
  id: {
    subject: 'Laporan harian coinAI kamu',
    kicker: 'Laporan harian',
    summary: 'Ringkasan',
    total: 'Total saldo',
    spendable: 'Bisa dipakai',
    idle: 'Tabungan menganggur',
    invested: 'Diinvestasikan',
    split: 'dari setiap pembayaran masuk tabungan',
    holdings: 'Vault kamu',
    notInvested: 'Belum ada yang diinvestasikan.',
    market: 'Kondisi market',
    regime: { risk_on: 'Risk-on', neutral: 'Netral', risk_off: 'Risk-off' },
    marketSource: 'Harga terkini dari Chainlink di BNB Smart Chain · perubahan 24 jam dan 7 hari dari Binance',
    actions: 'Yang dilakukan agen',
    noActions: 'Tidak ada perubahan on-chain hari ini.',
    splitAction: 'Split tabungan diperbarui',
    investAction: 'Tabungan diinvestasikan ke vault',
    viewTx: 'Lihat di BscScan',
    note: 'Catatan Reporter',
    reminders: 'Pengingat',
    cta: 'Buka aplikasi',
    footer: 'Demo di BNB Smart Chain testnet — token tidak bernilai nyata. Atur notifikasi di app: AI Agent → Laporan & pengingat harian.',
    vault: { conservative: 'Konservatif', balanced: 'Seimbang', growth: 'Agresif' },
    apy: 'APY',
  },
  zh: {
    subject: '您的 coinAI 每日报告',
    kicker: '每日报告',
    summary: '概览',
    total: '总余额',
    spendable: '可用余额',
    idle: '闲置储蓄',
    invested: '已投资',
    split: '的每笔付款存入储蓄',
    holdings: '您的金库',
    notInvested: '尚未投资。',
    market: '市场判断',
    regime: { risk_on: '风险偏好', neutral: '中性', risk_off: '避险' },
    marketSource: '现价来自 BNB Smart Chain 上的 Chainlink · 24 小时与 7 日涨跌来自币安',
    actions: '智能体的操作',
    noActions: '今日无链上变动。',
    splitAction: '储蓄比例已更新',
    investAction: '储蓄已投入金库',
    viewTx: '在 BscScan 查看',
    note: '报告员备注',
    reminders: '提醒',
    cta: '打开应用',
    footer: 'BNB Smart Chain 测试网演示——代币无真实价值。可在应用中的「AI 智能体 → 每日报告与提醒」管理通知。',
    vault: { conservative: '稳健', balanced: '平衡', growth: '成长' },
    apy: 'APY',
  },
} satisfies Record<Locale, unknown>

const INTL: Record<Locale, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function money(x: bigint, locale: Locale): string {
  return `${new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 2 }).format(Number(x) / 1e6)} tUSDT`
}
const pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`
const color = (x: number) => (x >= 0 ? C.up : C.down)

const label = (text: string) =>
  `<div style="font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.muted};">${esc(text)}</div>`

const section = (title: string, body: string) => `
  <tr><td style="padding:28px 32px 0;">
    ${label(title)}
    <div style="margin-top:12px;">${body}</div>
  </td></tr>`

export type ReportEmail = { subject: string; html: string; text: string }

export function renderReportEmail(opts: {
  run: RunResult
  state: UserState
  market: MarketSnapshot | null
  locale: Locale
  appUrl?: string
}): ReportEmail {
  const { run, state, market, locale } = opts
  const t = EMAIL_LABELS[locale]
  const date = new Intl.DateTimeFormat(INTL[locale], { dateStyle: 'long' }).format(new Date(run.at))
  const invested = state.vaults.reduce((s, v) => s + v.userPosition, state.positions.basket) // vaults + the AI Smart Money basket
  const total = state.spend + state.savings + invested
  const lead = run.report.split('\n').find((l) => l.trim()) ?? ''
  const appLink = opts.appUrl ? `${opts.appUrl.replace(/\/$/, '')}/app/agent` : null

  const kpi = (name: string, value: string, strong: boolean, side: 'l' | 'r') => `
    <td width="50%" style="padding:0 ${side === 'l' ? 6 : 0}px 12px ${side === 'r' ? 6 : 0}px;">
      <div style="padding:14px 16px;border:1px solid ${C.line};border-radius:10px;background:${strong ? C.soft : C.card};">
        ${label(name)}
        <div style="margin-top:6px;font-family:${SANS};font-size:${strong ? 22 : 18}px;font-weight:600;color:${C.ink};">${esc(value)}</div>
      </div>
    </td>`

  const balances = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>${kpi(t.total, money(total, locale), true, 'l')}${kpi(t.spendable, money(state.spend, locale), false, 'r')}</tr>
      <tr>${kpi(t.idle, money(state.savings, locale), false, 'l')}${kpi(t.invested, money(invested, locale), false, 'r')}</tr>
    </table>
    <div style="font-family:${SANS};font-size:13px;color:${C.muted};">
      <b style="color:${C.ink};">${state.splitBps / 100}%</b> ${esc(t.split)}
    </div>`

  const held = state.vaults.filter((v) => v.userPosition > 0n)
  const holdings = held.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:${SANS};font-size:14px;">
        ${held
          .map(
            (v) => `<tr>
              <td style="padding:10px 0;border-top:1px solid ${C.line};color:${C.ink};">${esc(t.vault[v.target as Target])}
                <span style="color:${C.muted};font-size:12px;"> · ${t.apy} ${(v.apyBps / 100).toFixed(0)}%</span></td>
              <td align="right" style="padding:10px 0;border-top:1px solid ${C.line};font-weight:600;color:${C.ink};">${esc(money(v.userPosition, locale))}</td>
            </tr>`,
          )
          .join('')}
      </table>`
    : `<div style="font-family:${SANS};font-size:14px;color:${C.muted};">${esc(t.notInvested)}</div>`

  const regimeColor = run.market?.regime === 'risk_on' ? C.up : run.market?.regime === 'risk_off' ? C.down : C.gold
  const marketBlock = `
    ${
      run.market
        ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${regimeColor};color:#fff;font-family:${MONO};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">${esc(t.regime[run.market.regime])}</span>
           <div style="margin-top:10px;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink};">${esc(run.market.summary)}</div>`
        : ''
    }
    ${
      market
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;font-family:${SANS};font-size:13px;">
            ${market.coins
              .map(
                (c) => `<tr>
                  <td style="padding:8px 0;border-top:1px solid ${C.line};font-weight:600;color:${C.ink};">${esc(c.symbol)}</td>
                  <td align="right" style="padding:8px 0;border-top:1px solid ${C.line};color:${C.ink};">$${esc(c.price.toLocaleString('en-US'))}</td>
                  <td align="right" style="padding:8px 0 8px 12px;border-top:1px solid ${C.line};color:${color(c.change24h)};">${pct(c.change24h)} <span style="color:${C.muted};font-size:11px;">24h</span></td>
                  <td align="right" style="padding:8px 0 8px 12px;border-top:1px solid ${C.line};color:${color(c.change7d)};">${pct(c.change7d)} <span style="color:${C.muted};font-size:11px;">7d</span></td>
                </tr>`,
              )
              .join('')}
          </table>
          <div style="margin-top:8px;font-family:${SANS};font-size:11px;color:${C.muted};">${esc(t.marketSource)}</div>`
        : ''
    }`

  const actions = run.executed.length
    ? run.executed
        .map(
          (e) => `<div style="padding:12px 14px;margin-bottom:8px;border-left:3px solid ${C.primary};background:${C.soft};border-radius:6px;">
            <div style="font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};">${esc(e.kind === 'set_split' ? t.splitAction : t.investAction)}</div>
            <div style="margin-top:4px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${esc(e.reason)}</div>
            <a href="${esc(explorerTx(e.txHash))}" style="display:inline-block;margin-top:6px;font-family:${SANS};font-size:12px;color:${C.primary};">${esc(t.viewTx)} →</a>
          </div>`,
        )
        .join('')
    : `<div style="font-family:${SANS};font-size:14px;color:${C.muted};">${esc(t.noActions)}</div>`

  const note = `<div style="padding:16px 18px;border:1px solid ${C.line};border-radius:10px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.ink};white-space:pre-line;">${esc(run.report)}</div>`

  const reminders = run.reminders.length
    ? run.reminders
        .map((r) => `<div style="padding:8px 12px;margin-bottom:6px;border-left:3px solid ${C.gold};font-family:${SANS};font-size:13px;color:${C.ink};">${esc(r)}</div>`)
        .join('')
    : ''

  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(lead)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.bg};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden;">
        <tr><td style="background:${C.primary};padding:26px 32px;">
          <div style="font-family:${SERIF};font-size:28px;color:#fff;">coinAI</div>
          <div style="margin-top:6px;font-family:${MONO};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#cfe0d4;">${esc(t.kicker)} · ${esc(date)} · BNB Smart Chain</div>
        </td></tr>
        <tr><td style="padding:28px 32px 0;font-family:${SERIF};font-size:22px;line-height:1.35;color:${C.ink};">${esc(lead)}</td></tr>
        ${section(t.summary, balances)}
        ${section(t.holdings, holdings)}
        ${section(t.market, marketBlock)}
        ${section(t.actions, actions)}
        ${section(t.note, note)}
        ${reminders ? section(t.reminders, reminders) : ''}
        ${
          appLink
            ? `<tr><td align="center" style="padding:30px 32px 6px;">
                <a href="${esc(appLink)}" style="display:inline-block;padding:13px 26px;background:#0b0b0b;color:#fff;text-decoration:none;border-radius:4px;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;">${esc(t.cta)} →</a>
              </td></tr>`
            : ''
        }
        <tr><td style="padding:24px 32px 30px;">
          <div style="border-top:1px solid ${C.line};padding-top:16px;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.muted};">
            ${esc(t.footer)}<br>${esc(state.user.slice(0, 6))}…${esc(state.user.slice(-4))}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `coinAI — ${t.kicker} · ${date}`,
    '',
    run.report,
    '',
    `${t.total}: ${money(total, locale)} (${t.spendable} ${money(state.spend, locale)} · ${t.idle} ${money(state.savings, locale)} · ${t.invested} ${money(invested, locale)})`,
    ...run.executed.map((e) => `• ${e.kind === 'set_split' ? t.splitAction : t.investAction}: ${e.reason} ${explorerTx(e.txHash)}`),
    ...(appLink ? ['', appLink] : []),
  ].join('\n')

  return { subject: `${t.subject} · ${date}`, html, text }
}

