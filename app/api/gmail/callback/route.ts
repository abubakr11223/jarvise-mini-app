// Gmail OAuth2 callback — code → refresh_token
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  const css = `body{margin:0;background:#0a0a0c;color:#fff;font-family:system-ui;padding:24px;max-width:520px}
    h2{margin-bottom:12px}code,pre{background:#1a1a1f;padding:8px 12px;border-radius:8px;word-break:break-all;font-size:12px;color:#60a5fa;display:block;margin:8px 0}
    .btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#6366f1;color:#fff;border-radius:12px;text-decoration:none;font-size:14px}`

  if (error || !code) {
    return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style></head><body>
<h2 style="color:#ef4444">❌ Gmail ulanmadi</h2>
<p style="color:#9ca3af">${error || 'Noma\'lum xato'}</p>
<a href="/api/gmail/auth" class="btn">Qayta urinish</a>
</body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  const clientId     = process.env.GMAIL_CLIENT_ID!
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL || 'https://jarvise-mini-app-jf5u.vercel.app'
  const redirectUri  = `${appUrl}/api/gmail/callback`
  const botUser      = process.env.TELEGRAM_BOT_USERNAME || 'hisob_shaxsiy_bot'
  const botApp       = process.env.TELEGRAM_BOT_APP || 'app'

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    })
    const d = await res.json()

    if (!d.refresh_token) {
      return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<h2 style="color:#ef4444">❌ Refresh token olinmadi</h2>
<p style="color:#9ca3af">Access token mavjud bo'lishi mumkin. Quyidagini bajarip ko'ring:</p>
<p>1. <a href="https://myaccount.google.com/permissions" style="color:#60a5fa">Google Account Permissions</a> dan ilovani o'chiring</p>
<p>2. <a href="/api/gmail/auth" style="color:#60a5fa">Qayta urinish</a></p>
<pre>${JSON.stringify(d, null, 2)}</pre>
</body></html>`, { headers: { 'Content-Type': 'text/html' } })
    }

    return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style></head><body>
<h2 style="color:#10b981">✅ Gmail muvaffaqiyatli ulandi!</h2>
<p style="color:#9ca3af;margin-bottom:16px">Quyidagi GMAIL_REFRESH_TOKEN ni Vercel ga qo'shing:</p>

<pre>${d.refresh_token}</pre>

<p style="color:#f59e0b;font-size:13px;margin-top:16px">Terminal da:</p>
<code>cd jarvis-mini-app && npx vercel env add GMAIL_REFRESH_TOKEN production</code>
<p style="color:#9ca3af;font-size:12px;margin-top:4px">↑ Yuqoridagi tokenni paste qiling</p>

<p style="color:#9ca3af;font-size:13px;margin-top:20px">So'ng redeploy qiling:</p>
<code>npx vercel --prod</code>

<a href="https://t.me/${botUser}/${botApp}" class="btn">← Mini appga qaytish</a>
</body></html>`, { headers: { 'Content-Type': 'text/html' } })

  } catch (e) {
    return new Response(`Error: ${e}`, { status: 500 })
  }
}
