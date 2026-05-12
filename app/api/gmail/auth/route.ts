// Gmail OAuth2 boshlanishi — Google consent screen ga yo'naltiradi
import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID
  if (!clientId) {
    return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0a0a0c;color:#fff;font-family:system-ui;padding:24px;max-width:480px}h2{color:#ef4444}code{background:#1a1a1f;padding:4px 8px;border-radius:6px;font-size:12px;color:#60a5fa}</style></head><body>
<h2>❌ GMAIL_CLIENT_ID sozlanmagan</h2>
<p>Avval Google Cloud da credentials yarating:</p>
<ol style="color:#9ca3af;line-height:2">
<li>console.cloud.google.com ga kiring</li>
<li>Yangi project yarating</li>
<li>APIs → Gmail API ni yoqing</li>
<li>Credentials → OAuth 2.0 Client ID (Web application)</li>
<li>Authorized redirect URI: <code>https://jarvise-mini-app-jf5u.vercel.app/api/gmail/callback</code></li>
<li>Client ID va Secret ni Vercel ga qo'shing</li>
</ol>
</body></html>`, { headers: { 'Content-Type': 'text/html' } })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://jarvise-mini-app-jf5u.vercel.app'
  const redirectUri = `${appUrl}/api/gmail/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
