'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Search, Grid, Activity, Menu, X, ChevronLeft, Bookmark, FileText, Send, BookOpen, User, Bot, PenTool, Package, CreditCard } from 'lucide-react'

// 👇 MANA SHU YERGA N8N "PRODUCTION URL" SSILKASINI QO'YING:
const N8N_WEBHOOK_URL = "https://abusaidbakrdov.app.n8n.cloud/webhook-test/8bafdcfb-2d60-4698-ad3e-920c16074495";

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAppsOpen, setIsAppsOpen] = useState(false)
  const [isKitobOpen, setIsKitobOpen] = useState(false)

  const [inputText, setInputText] = useState("")
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([])

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
        if (WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
          setUserData(WebApp.initDataUnsafe.user);
        }
        setWebApp(WebApp);
      });
    }
  }, [])

  const openExternalLink = (url: string) => {
    if (webApp) webApp.openLink(url);
    else window.open(url, '_blank');
    setIsAppsOpen(false);
  }

  // AI GA YUBORISH
  const sendToAI = async (text: string | null, audioBlob: Blob | null = null) => {
    setIsLoading(true);

    if (text) setMessages(prev => [...prev, { role: 'user', text: text }]);
    if (audioBlob) setMessages(prev => [...prev, { role: 'user', text: '🎤 Ovozli xabar yuborildi...' }]);

    try {
      let response;
      if (audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.webm');
        formData.append('user_id', userData?.id?.toString() || '0');
        response = await fetch(N8N_WEBHOOK_URL, { method: 'POST', body: formData });
      } else {
        response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, user_id: userData?.id || 0 }),
        });
      }

      const data = await response.json();
      if (data && data.reply) {
        setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } else {
        // Agar n8n da 'reply' deb JSON qaytarmagan bo'lsangiz
        setMessages(prev => [...prev, { role: 'ai', text: '✅ Qabul qilindi! N8n-da "Respond to Webhook" sozlanganligini tekshiring.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Aloqa uzildi. Webhook ssilkasini tekshiring.' }]);
    } finally {
      setIsLoading(false);
      setInputText("");
    }
  }

  const handleSendText = () => {
    if (inputText.trim() === "") return;
    sendToAI(inputText);
  }

  // OVOZ YOZISH
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
        if (webApp) webApp.showAlert("Iltimos, Telegram sozlamalaridan Mikrofonga ruxsat bering!");
        else alert("Mikrofonga ruxsat bering!");
      }
    }
  }

  return (
    <main className="relative flex h-screen bg-[#111114] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse z-50"></div>}

      {/* CHAP PANEL */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#2c2c31]/80 backdrop-blur-md px-1 py-4 rounded-r-xl flex flex-col items-center gap-2 z-20 shadow-lg active:scale-95 transition-transform">
          <Grid size={14} className="text-blue-400" />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="text-[10px] text-gray-300 font-bold tracking-widest mt-1">SUPER APP</span>
        </button>
      )}
      <div className={`fixed inset-y-0 left-0 w-[70px] bg-[#1a1a1f] flex flex-col items-center py-6 gap-6 z-40 transition-transform duration-300 shadow-2xl border-r border-gray-800 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">{userData?.first_name?.charAt(0) || 'J'}</div>
        <button onClick={() => setIsSidebarOpen(false)} className="absolute -right-10 top-1/2 p-2 bg-[#1a1a1f] rounded-r-xl text-gray-400"><ChevronLeft size={20} /></button>
      </div>

      {/* ASOSIY OYNA */}
      <section className="flex-1 flex flex-col w-full h-full pt-4 pb-[90px]">
        <header className="flex justify-between items-center w-full px-4 mb-6">
          <div className="w-8 h-8 rounded-full border border-gray-700 overflow-hidden bg-[#242429] flex justify-center items-center"><Menu size={16} className="text-gray-400" /></div>
          <div className="flex flex-col items-center">
            <span className="text-white font-bold text-sm">Jarvis AI</span>
            <span className="text-[10px] text-green-400">Online</span>
          </div>
          <div className="flex gap-2"><Bookmark size={20} className="text-gray-400" /></div>
        </header>

        {/* TUGMALAR (Notion, Figma, Kitob) */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => setIsKitobOpen(true)} className="bg-[#212126] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform border border-green-500/30 shadow-lg">
              <BookOpen size={20} className="text-green-400" />
              <span className="text-[10px] text-gray-300">Qarzlar</span>
            </button>
            <button onClick={() => openExternalLink('https://notion.so')} className="bg-[#212126] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg">
              <FileText size={20} className="text-white" />
              <span className="text-[10px] text-gray-300">Notion</span>
            </button>
            <button onClick={() => openExternalLink('https://figma.com')} className="bg-[#212126] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg">
              <PenTool size={20} className="text-pink-400" />
              <span className="text-[10px] text-gray-300">Figma</span>
            </button>
            <button onClick={() => setIsAppsOpen(true)} className="bg-[#212126] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg">
              <Grid size={20} className="text-blue-400" />
              <span className="text-[10px] text-gray-300">Vse Mini</span>
            </button>
          </div>
        </div>

        {/* CHAT TARIXI */}
        <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-50">
              <span className="text-5xl mb-4">🤖</span>
              <p className="text-sm">Men tayyorman! Buyruq bering.</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-md ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-[#212126] text-gray-200 rounded-bl-none border border-gray-700/50'
                }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </section>

      {/* 🌟 YANGILANGAN PASTKI QISM (Dinamik Send/Mic tugmasi) 🌟 */}
      <div className="fixed bottom-4 left-4 right-4 flex items-center gap-2 z-10">
        <div className="flex-1 bg-[#212126] rounded-full flex items-center px-4 py-3.5 border border-gray-700/50 shadow-xl relative">
          <Search size={20} className="text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Yozing yoki ovozli xabar..."
            className="bg-transparent border-none outline-none text-white w-full text-[16px] placeholder-gray-500"
          />
        </div>

        {/* TELEGRAM MANTIQI: Matn bo'lsa Send, bo'lmasa Mikrofon */}
        {inputText.trim().length > 0 ? (
          <button
            onClick={handleSendText}
            className="w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-xl bg-blue-500 shadow-blue-500/40 active:scale-90 transition-transform"
          >
            <Send size={20} className="text-white ml-[-2px]" />
          </button>
        ) : (
          <button
            onClick={toggleRecording}
            className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isRecording ? 'bg-red-500 shadow-red-500/40 animate-pulse scale-110' : 'bg-[#212126] border border-gray-700/50 active:scale-90'}`}
          >
            <Mic size={22} className={isRecording ? 'text-white' : 'text-blue-400'} />
          </button>
        )}
      </div>

      {/* KITOB OYNASI */}
      {isKitobOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#111114] animate-slide-up">
          <header className="flex justify-between items-center w-full p-4 border-b border-gray-800 bg-[#1a1a1f]">
            <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-green-500" /> Daftari</h2>
            <button onClick={() => setIsKitobOpen(false)} className="p-2 bg-[#212126] rounded-full text-gray-400"><X size={20} /></button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="bg-[#1a1a1f] rounded-xl overflow-hidden border border-gray-800 shadow-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#212126] text-gray-400">
                  <tr><th className="p-3 font-medium">Kim/Nima</th><th className="p-3 font-medium">Summa</th><th className="p-3 font-medium">Holat</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="p-3">Hasanboy</td><td className="p-3 text-red-400">-$500</td><td className="p-3"><span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-[10px]">Qarz</span></td></tr>
                  <tr><td className="p-3">Suxrob</td><td className="p-3 text-green-400">+$1200</td><td className="p-3"><span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-[10px]">Daromad</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* BARCHA ILOVALAR */}
      {isAppsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full h-[60%] bg-[#121216] rounded-t-3xl p-6 relative border-t border-gray-800 animate-slide-up">
            <button onClick={() => setIsAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#212126] rounded-full text-gray-400"><X size={20} /></button>
            <h3 className="text-xl font-bold mb-6 mt-2">Все сервисы</h3>
            <div className="grid grid-cols-3 gap-4">
              <button onClick={() => openExternalLink('https://uzum.uz')} className="flex flex-col items-center gap-2 p-4 bg-[#212126] rounded-2xl active:scale-95 transition-transform"><Package size={24} className="text-purple-500" /><span className="text-xs">Uzum</span></button>
              <button className="flex flex-col items-center gap-2 p-4 bg-[#212126] rounded-2xl active:scale-95 transition-transform"><CreditCard size={24} className="text-blue-500" /><span className="text-xs">Finance</span></button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}