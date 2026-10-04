// Test kirim email Gmail SMTP — jalankan: node scripts/test-email.mjs
import nodemailer from 'nodemailer'

const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
const TO = process.env.TEST_TO || GMAIL_USER // default: kirim ke diri sendiri

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('❌ GMAIL_USER dan GMAIL_APP_PASSWORD harus di-set')
  console.error('   export GMAIL_USER="email@gmail.com"')
  console.error('   export GMAIL_APP_PASSWORD="abcdefghijklmnop"')
  process.exit(1)
}

const transport = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
})

try {
  console.log(`Mengirim email dari ${GMAIL_USER} → ${TO} ...`)
  const info = await transport.sendMail({
    from: `coinAI <${GMAIL_USER}>`,
    to: TO,
    subject: '✅ Test email coinAI',
    text: `Halo!

Ini adalah test email dari coinAI App Password.

Timestamp: ${new Date().toISOString()}

Jika kamu menerima email ini, berarti SMTP Gmail sudah terkonfigurasi dengan benar.

— coinAI Bot`,
  })
  console.log('✅ Berhasil!', info.messageId)
  console.log('   Response:', info.response)
} catch (err) {
  console.error('❌ Gagal:', err.message)
  if (err.code) console.error('   Code:', err.code)
  process.exit(1)
}
