// Telegram session string olish — bir marta ishga tushiring
// Ishlatish: node scripts/get-session.mjs

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import * as readline from 'readline'

const API_ID   = 36200589
const API_HASH = '0b7997b5e036bfaff92805ba4c4272af'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(res => rl.question(q, res))

console.log('\n🔐 Telegram Session String Generator\n')

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
  connectionRetries: 3,
})

await client.start({
  phoneNumber:  async () => ask('📱 Telefon raqam (+998...): '),
  password:     async () => ask('🔒 2FA parol (bo\'lmasa Enter): '),
  phoneCode:    async () => ask('✉️  Telegramga kelgan kod: '),
  onError:      (err) => console.error('❌ Xato:', err.message),
})

const session = client.session.save()
console.log('\n✅ Session string:\n')
console.log(session)
console.log('\n📋 Quyidagi buyruqni ishga tushiring:\n')
console.log(`npx vercel env add TG_USERBOT_SESSION production`)
console.log(`(so'ralganida yuqoridagi session stringni kiriting)\n`)

await client.disconnect()
rl.close()
