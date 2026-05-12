// Server-side proxy: X-Frame-Options ni olib tashlaydi → iframe ichida ochiladi
// Barcha linklar ham proxy orqali o'tkaziladi → "Open Link" dialog chiqmaydi

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36 Telegram/10.9.0'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return new NextResponse('No URL', { status: 400 })

  let parsed: URL
  try { parsed = new URL(url) } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new NextResponse('Bad protocol', { status: 400 })
  }

  // Our proxy base URL (absolute, same domain → no Telegram dialog)
  const appOrigin = new URL(request.url).origin
  const PROXY = `${appOrigin}/api/proxy?url=`
  const origin  = `${parsed.protocol}//${parsed.host}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'uz,ru;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    })

    const ct = res.headers.get('content-type') || 'text/html'

    // Non-HTML resources — pass through directly
    if (!ct.includes('text/html')) {
      const body = await res.arrayBuffer()
      return new NextResponse(body, {
        headers: {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=600',
        },
      })
    }

    let html = await res.text()

    // ── 1. <base href> — relative URL larni to'g'irlaydi ─────────────────
    const baseTag = `<base href="${origin}/">`
    html = html.includes('<head')
      ? html.replace(/(<head[^>]*>)/i, `$1${baseTag}`)
      : baseTag + html

    // ── 2. CSP + X-Frame meta taglarini olib tashlaymiz ──────────────────
    html = html.replace(
      /<meta[^>]*(?:x-frame-options|frame-ancestors|content-security-policy)[^>]*>/gi, ''
    )

    // ── 3. Server-side: <a href="http..."> → proxy URL ───────────────────
    // Bu JS dan oldin ishlaydi → eng ishonchli usul
    html = html.replace(
      /(<a\b[^>]*?\s)href="(https?:\/\/[^"]+)"/gi,
      (_, before, href) => `${before}href="${PROXY}${encodeURIComponent(href)}"`
    )

    // ── 4. Client-side navigation interceptor ─────────────────────────────
    // JS orqali yangi URL o'rnatilsa ham proxy dan o'tadi
    const spoof = `<script>
(function(){
  var PROXY='${PROXY}';
  var ORIGIN='${origin}';

  // iframe aniqlovchi skriptlarni aldaymiz
  try{Object.defineProperty(window,'top',{get:()=>window,configurable:true})}catch(e){}
  try{Object.defineProperty(window,'parent',{get:()=>window,configurable:true})}catch(e){}
  try{Object.defineProperty(window,'frameElement',{get:()=>null,configurable:true})}catch(e){}

  // Absolute URL yaratuvchi helper
  function toAbs(u){
    try{return new URL(u,ORIGIN+'/').href;}catch(e){return u;}
  }
  function toProxy(u){
    var a=toAbs(u);
    return a.startsWith(PROXY)?a:PROXY+encodeURIComponent(a);
  }

  // Barcha link kliklarni ushlaymiz (capture, oldin ishlaydi)
  document.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t.tagName!=='A')t=t.parentElement;
    if(!t)return;
    var href=t.getAttribute('href');
    if(!href||href.startsWith('#')||href.startsWith('javascript:')||href.startsWith('mailto:')||href.startsWith('tel:'))return;
    // Agar allaqachon proxy URL bo'lsa — o'tkazib yuboramiz
    if(href.startsWith(PROXY))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    window.location.href=toProxy(href);
    return false;
  },true);

  // window.open → proxy orqali
  window.open=function(u){
    if(u)window.location.href=toProxy(u);
    return null;
  };

  // Form submit → proxy orqali
  document.addEventListener('submit',function(e){
    var form=e.target;
    var action=form.getAttribute('action');
    if(!action)return;
    var abs=toAbs(action);
    if(!abs.startsWith(PROXY)){
      e.preventDefault();e.stopPropagation();
      form.action=PROXY+encodeURIComponent(abs);
      form.submit();
    }
  },true);

  // pushState / replaceState — history navigation
  var origPush=history.pushState.bind(history);
  var origReplace=history.replaceState.bind(history);
  function wrapState(fn){
    return function(state,title,url){
      if(url){
        var abs=toAbs(String(url));
        if(!abs.startsWith(location.origin)){
          window.location.href=toProxy(abs);return;
        }
      }
      return fn(state,title,url);
    };
  }
  try{history.pushState=wrapState(origPush);}catch(e){}
  try{history.replaceState=wrapState(origReplace);}catch(e){}
})();
</script>`
    html = html.replace('</head>', spoof + '</head>')

    // ── 5. target="_self" (tab ochilmasin) ───────────────────────────────
    html = html.replace(/<a\s/gi, '<a target="_self" ')

    return new NextResponse(html, {
      status: res.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        // X-Frame-Options ATAY O'TKAZILMAYDI → iframe ishlaydi
      },
    })
  } catch (e) {
    const errHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0a0a0c;color:#fff;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px}
h2{color:#ef4444;font-size:18px;margin-bottom:8px}.url{color:#6b7280;font-size:12px;word-break:break-all}
.btn{margin-top:24px;background:#3b82f6;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:14px;cursor:pointer}</style>
</head><body>
<h2>⚠️ Sayt yuklanmadi</h2>
<p class="url">${url}</p>
<p style="color:#9ca3af;font-size:13px;margin-top:12px">Bu sayt iframe da ochilishni rad etdi.</p>
<button class="btn" onclick="window.parent.postMessage({type:'OPEN_EXTERNAL',url:'${url}'},'*')">Tashqi brauzerda ochish</button>
</body></html>`
    return new NextResponse(errHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
