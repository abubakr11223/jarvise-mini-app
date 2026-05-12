// Gmail API helper — OAuth2 refresh token orqali ishlaydi
// GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN kerak

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

// Access token cache (serverless instances across requests)
let _cachedToken: string | null = null
let _tokenExpiry  = 0

export async function getGmailToken(): Promise<string | null> {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken

  const clientId     = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret,
        refresh_token: refreshToken, grant_type: 'refresh_token',
      }),
    })
    const d = await res.json()
    if (!d.access_token) return null
    _cachedToken = d.access_token
    _tokenExpiry = Date.now() + (d.expires_in || 3600) * 1000
    return _cachedToken
  } catch { return null }
}

export interface GmailMessage {
  id: string; threadId: string; subject: string
  from: string; fromName: string; date: string
  snippet: string; unread: boolean; labels: string[]
}

export interface GmailMessageFull extends GmailMessage {
  body: string; html: string
}

function parseHeaders(headers: Array<{name:string;value:string}>) {
  const get = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
  const fromRaw = get('From')
  const nameMatch = fromRaw.match(/^"?([^"<]+)"?\s*</)
  return {
    subject: get('Subject'),
    from: fromRaw,
    fromName: nameMatch ? nameMatch[1].trim() : fromRaw.replace(/<.*>/, '').trim() || fromRaw,
    date: (() => {
      try { return new Date(get('Date')).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) }
      catch { return get('Date') }
    })(),
  }
}

function extractBody(payload: Record<string, unknown>, type: 'text/plain' | 'text/html'): string {
  if (!payload) return ''
  if ((payload.mimeType as string) === type) {
    const data = (payload.body as {data?: string})?.data
    if (data) return Buffer.from(data, 'base64url').toString('utf-8')
  }
  for (const part of ((payload.parts || []) as Record<string, unknown>[])) {
    const found = extractBody(part, type)
    if (found) return found
  }
  return ''
}

// List messages (default: inbox)
export async function gmailList(
  query = 'in:inbox', maxResults = 25
): Promise<GmailMessage[]> {
  const token = await getGmailToken()
  if (!token) return []
  try {
    const listRes = await fetch(
      `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const list = await listRes.json()
    if (!list.messages?.length) return []

    const details = await Promise.all(
      list.messages.slice(0, 15).map(async (m: {id:string}) => {
        const r = await fetch(
          `${GMAIL_API}/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const d = await r.json()
        const { subject, from, fromName, date } = parseHeaders(d.payload?.headers || [])
        return {
          id: m.id, threadId: d.threadId,
          subject, from, fromName, date,
          snippet: (d.snippet || '').replace(/&#39;/g,"'").replace(/&amp;/g,'&'),
          unread: (d.labelIds || []).includes('UNREAD'),
          labels: d.labelIds || [],
        } as GmailMessage
      })
    )
    return details
  } catch { return [] }
}

// Read full message
export async function gmailRead(id: string): Promise<GmailMessageFull | null> {
  const token = await getGmailToken()
  if (!token) return null
  try {
    const r = await fetch(
      `${GMAIL_API}/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const d = await r.json()
    const { subject, from, fromName, date } = parseHeaders(d.payload?.headers || [])
    const body = extractBody(d.payload, 'text/plain')
      .replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0, 3000)
    const html = extractBody(d.payload, 'text/html').slice(0, 8000)
    return {
      id, threadId: d.threadId,
      subject, from, fromName, date,
      snippet: (d.snippet || '').replace(/&#39;/g,"'"),
      unread: (d.labelIds || []).includes('UNREAD'),
      labels: d.labelIds || [],
      body, html,
    }
  } catch { return null }
}

// Search messages
export async function gmailSearch(q: string): Promise<GmailMessage[]> {
  return gmailList(q, 10)
}
