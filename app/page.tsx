'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Search, Grid, Menu, X, Bookmark, FileText, Send, BookOpen, User, Bot, Package, CreditCard } from 'lucide-react'

// 👇 MANA SHU YERGA N8N "PRODUCTION URL" SSILKASINI QO'YING:
const N8N_WEBHOOK_URL = "https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495";

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [isAppsOpen, setIsAppsOpen] = useState(false)
  const [isKitobOpen, setIsKitobOpen] = useState(false)

  const [inputText, setInputText] = useState("")
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([
    { role: 'ai', text: 'Salom Xo\'jayin! Matn yozing yoki ovozli xabar qoldiring.' }
  ])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [webApp, setWebApp] = useState<any>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((module) => {
        const WebApp = module.default;
        WebApp.ready();
        WebApp.expand();
        WebApp.setHeaderColor('#111114');
        WebApp.setBackgroundColor('#111114');
        if (WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) setUserData(WebApp.initDataUnsafe.user);
        setWebApp(WebApp);
      });
    }
  }, [])

  const openExternalLink = (url: string) => {
    if (webApp) webApp.openLink(url);
    else window.open(url, '_blank');
  }

  // 🚀 AI GA YUBORISH (TEXT VA OVOZ)
  const sendToAI = async (text: string | null, audioBlob: Blob | null = null) => {
    if (!N8N_WEBHOOK_URL.includes("http")) {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Dasturchi xatosi: N8N ssilkasi qo\'yilmagan!' }]);
      return;
    }

    setIsLoading(true);
    if (text) setMessages(prev => [...prev, { role: 'user', text: text }]);
    if (audioBlob) setMessages(prev => [...prev, { role: 'user', text: '🎤 Ovozli xabar yuborildi...' }]);

    try {
      const url = N8N_WEBHOOK_URL.trim();
      let response;

      if (audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.webm');
        formData.append('user_id', userData?.id?.toString() || '0');
        response = await fetch(url, { method: 'POST', body: formData });
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ message: text, user_id: userData?.id || 0 }),
        });
      }

      if (!response.ok) throw new Error(`Xato kodi: ${response.status}`);

      const data = await response.json();
      if (data && data.reply) {
        setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: '✅ Qabul qilindi, lekin AI javob yozmadi.' }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `❌ Ulanish xatosi: n8n'da "Publish" yashil yonib turganini tekshiring!` }]);
    } finally {
      setIsLoading(false);
      setInputText("");
    }
  }

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          sendToAI(null, audioBlob);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        if (webApp) webApp.showAlert("Mikrofonga ruxsat bermadingiz!");
      }
    }
  }

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse z-50"></div>}

      <header className="flex justify-between items-center w-full px-4 py-4 bg-[#111114] border-b border-gray-800/50 shrink-0">
        <div className="w-8 h-8 rounded-full border border-gray-700 bg-[#242429] flex justify-center items-center"><Menu size={16} className="text-gray-400" /></div>
        <div className="flex flex-col items-center">
          <span className="text-white font-bold text-sm">Jarvis AI</span>
          <span className="text-[10px] text-green-400">Online</span>
        </div>
        <div className="flex gap-2"><Bookmark size={20} className="text-gray-400" /></div>
      </header>

      <div className="w-full overflow-x-auto scrollbar-hide shrink-0 bg-[#111114] pb-3 pt-2">
        <div className="flex gap-2 px-4 w-max">
          <button onClick={() => setIsKitobOpen(true)} className="bg-[#1a1a1f] border border-green-500/30 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <BookOpen size={14} className="text-green-400" />
            <span className="text-xs font-medium">Qarz/Rasxod</span>
          </button>
          <button onClick={() => openExternalLink('https://notion.so')} className="bg-[#1a1a1f] border border-gray-700 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <FileText size={14} className="text-white" />
            <span className="text-xs font-medium">Notion</span>
          </button>
          <button onClick={() => setIsAppsOpen(true)} className="bg-[#1a1a1f] border border-gray-700 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <Grid size={14} className="text-blue-400" />
            <span className="text-xs font-medium">Ilovalar</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 pb-[80px]">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 mb-1 opacity-50 px-1">
              {msg.role === 'user' ? <User size={10} /> : <Bot size={10} />}
              <span className="text-[9px] uppercase font-bold tracking-wider">{msg.role === 'user' ? 'Siz' : 'Jarvis'}</span>
            </div>
            <div className={`max-w-[85%] rounded-2xl p-3.5 text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-[#1a1a1f] text-gray-100 rounded-tl-sm border border-gray-800'
              }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c] to-transparent z-10">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#1a1a1f] rounded-3xl flex items-center px-4 py-1.5 border border-gray-700/80 shadow-lg relative min-h-[52px]">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendToAI(inputText)}
              placeholder="Xabar yozing..."
              className="bg-transparent border-none outline-none text-white w-full text-[15px] placeholder-gray-500 py-3"
            />
          </div>

          {inputText.trim().length > 0 ? (
            <button onClick={() => sendToAI(inputText)} className="w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center bg-blue-600 shadow-lg shadow-blue-600/30 active:scale-90 transition-transform">
              <Send size={20} className="text-white ml-[-2px]" />
            </button>
          ) : (
            <button onClick={toggleRecording} className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${isRecording ? 'bg-red-500 shadow-red-500/40 animate-pulse scale-110' : 'bg-[#1a1a1f] border border-gray-700/80 active:scale-90'}`}>
              <Mic size={22} className={isRecording ? 'text-white' : 'text-blue-400'} />
            </button>
          )}
        </div>
      </div>

      {isKitobOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#111114]">
            <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-green-500" /> Qarz va Rasxod</h2>
            <button onClick={() => setIsKitobOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full text-gray-400"><X size={20} /></button>
          </header>
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="bg-[#111114] rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-[#1a1a1f] text-gray-400 text-xs uppercase">
                  <tr><th className="p-4 font-medium">Kim/Nima</th><th className="p-4 font-medium">Summa</th><th className="p-4 font-medium">Holat</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  <tr><td className="p-4">Hasanboy</td><td className="p-4 text-red-400 font-medium">-$500</td><td className="p-4"><span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-1 rounded text-[10px] uppercase font-bold">Qarz</span></td></tr>
                  <tr><td className="p-4">Suxrob</td><td className="p-4 text-green-400 font-medium">+$1200</td><td className="p-4"><span className="bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-1 rounded text-[10px] uppercase font-bold">Kirim</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isAppsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full h-[50%] bg-[#111114] rounded-t-[30px] p-6 relative border-t border-gray-800 animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <button onClick={() => setIsAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full text-gray-400"><X size={20} /></button>
            <h3 className="text-xl font-bold mb-6 mt-2 text-white">Xizmatlar</h3>
            <div className="grid grid-cols-4 gap-4">
              <button onClick={() => openExternalLink('https://uzum.uz')} className="flex flex-col items-center gap-3 active:scale-95 transition-transform"><div className="w-14 h-14 bg-[#1a1a1f] border border-gray-800 rounded-2xl flex items-center justify-center shadow-lg"><Package size={24} className="text-purple-500" /></div><span className="text-xs text-gray-300">Uzum</span></button>
              <button className="flex flex-col items-center gap-3 active:scale-95 transition-transform"><div className="w-14 h-14 bg-[#1a1a1f] border border-gray-800 rounded-2xl flex items-center justify-center shadow-lg"><CreditCard size={24} className="text-blue-500" /></div><span className="text-xs text-gray-300">Moliya</span></button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}