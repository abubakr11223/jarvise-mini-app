import { NextRequest, NextResponse } from 'next/server'

const SERPER_KEY = process.env.SERPER_API_KEY
const TAVILY_KEY = process.env.TAVILY_API_KEY

export async function POST(request: NextRequest) {
  const { query } = await request.json() as { query: string }
  if (!query?.trim()) return NextResponse.json({ results: '' })

  try {
    // 1. Serper.dev — Google qidirish (bepul: 2500 ta/oy)
    if (SERPER_KEY) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5, gl: 'uz', hl: 'ru' }),
      })
      if (res.ok) {
        const d = await res.json()
        const parts: string[] = []
        if (d.answerBox?.answer)   parts.push(d.answerBox.answer)
        if (d.answerBox?.snippet)  parts.push(d.answerBox.snippet)
        if (d.knowledgeGraph?.description) parts.push(d.knowledgeGraph.description)
        ;(d.organic || []).slice(0, 3).forEach((r: { title: string; snippet: string }) =>
          parts.push(`${r.title}: ${r.snippet}`)
        )
        if (parts.length > 0) return NextResponse.json({ results: parts.join('\n\n').slice(0, 1500) })
      }
    }

    // 2. Tavily AI Search (bepul: 1000 ta/oy)
    if (TAVILY_KEY) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 5, search_depth: 'basic' }),
      })
      if (res.ok) {
        const d = await res.json()
        const parts = (d.results || []).slice(0, 3).map((r: { title: string; content: string }) =>
          `${r.title}: ${r.content}`
        )
        if (parts.length > 0) return NextResponse.json({ results: parts.join('\n\n').slice(0, 1500) })
      }
    }

    // 3. DuckDuckGo Instant Answers (bepul, kalit kerak emas)
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { next: { revalidate: 0 } })
    const d = await res.json()

    const parts: string[] = []
    if (d.Answer)       parts.push(d.Answer)
    if (d.AbstractText) parts.push(d.AbstractText)
    ;(d.RelatedTopics || []).slice(0, 3).forEach((t: { Text?: string }) => {
      if (t.Text) parts.push(t.Text)
    })

    return NextResponse.json({ results: parts.join('\n\n').slice(0, 1000) })
  } catch {
    return NextResponse.json({ results: '' })
  }
}
