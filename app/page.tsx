'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Search, Grid, ShoppingCart, Activity, Briefcase, Menu, X, ChevronLeft, Bookmark, FileText, Send, BookOpen, User, Bot } from 'lucide-react'

// 👇 MANA SHU YERGA N8N "PRODUCTION URL" SSILKASINI QO'YING:
const N8N_WEBHOOK_URL = "BU_YERGA_N8N_PRODUCTION_URL_SSILKASINI_QOYING";

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Oynalar holati
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAppsOpen, setIsAppsOpen] = useState(false)
  const [isKitobOpen, setIsKitobOpen] = useState(false) // Qarzlar daftari oynasi

  // Chat va Input uchun
  const [inputText, setInputText] = useState("")
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([
    { role: 'ai', text: 'Salom! Ovozli xabar qoldiring yoki matn yozing.' }
  ])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Xabarlar ko'payganda eng pastga avtomat tushish
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
      });
    }
  }, [])

  // 🚀 ASOSIY FUNKSIYA: N8N GA JO'NATISH VA JAVOBNI KUTISH
  const sendToAI = async (text: string | null, audioBlob: Blob | null = null) => {
    setIsLoading(true);

    // Foydalanuvchi xabarini ekranga qo'shish
    if (text) setMessages(prev => [...prev, { role: 'user', text: text }]);
    if (audioBlob) setMessages(prev => [...prev, { role: 'user', text: '🎤 Ovozli xabar...' }]);

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

      // N8n dan kelgan AI javobini ushlab olish va chatga chiqarish
      const data = await response.json();
      if (data && data.reply) {
        setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: '✅ Qabul qilindi! (Lekin n8n dan javob qaytmadi. Webhook Response ni tekshiring)' }]);
      }

    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Aloqa uzildi. Internetni yoki n8n ssilkasini tekshiring.' }]);
    } finally {
      setIsLoading(false);
      setInputText(""); // Inputni tozalash
    }
  }

  // Matn yuborish
  const handleSendText = () => {
    if (inputText.trim() === "") return;
    sendToAI(inputText);
  }

  // Ovoz yuborish
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
        alert("Mikrofonga ruxsat bering!");
      }
    }
  }

  return (
    <main className="relative flex h-screen bg-[#111114] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse z-50"></div>}

      {/* CHAP PANEL VA SUPER APP TUGMASI (Eski holatidek) */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#2c2c31]/80 backdrop-blur-md px-1 py-4 rounded-r-xl flex flex-col items-center gap-2 z-20 shadow-lg">
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

        <header className="flex justify-between items-center w-full px-4 mb-4">
          <div className="w-8 h-8 rounded-full border border-gray-700 overflow-hidden bg-[#242429] flex justify-center items-center"><Menu size={16} className="text-gray-400" /></div>
          <div className="flex items-center bg-[#242429] px-4 py-2 rounded-full border border-gray-800"><span className="text-white font-medium text-sm">Jarvis AI</span></div>
          <div className="flex gap-2"><Bookmark size={20} className="text-gray-400" /></div>
        </header>

        {/* TEZKOR KATEGORIYALAR */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => setIsKitobOpen(true)} className="bg-[#212126] rounded-xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform border border-green-500/30">
              <BookOpen size={20} className="text-green-400" />
              <span className="text-[10px] text-gray-300">Kitob (Qarz)</span>
            </button>
            <button className="bg-[#212126] rounded-xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
              <FileText size={20} className="text-white" />
              <span className="text-[10px] text-gray-300">Notion API</span>
            </button>
            <button className="bg-[#212126] rounded-xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
              <Activity size={20} className="text-cyan-400" />
              <span className="text-[10px] text-gray-300">Shifo24</span>
            </button>
            <button onClick={() => setIsAppsOpen(true)} className="bg-[#212126] rounded-xl p-3 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
              <Grid size={20} className="text-blue-400" />
              <span className="text-[10px] text-gray-300">Vse Mini</span>
            </button>
          </div>
        </div>

        {/* 🌟 JONLI CHAT TARIXI (Yangi qism) 🌟 */}
        <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-3 text-sm ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-[#212126] text-gray-200 rounded-bl-none border border-gray-700/50'
                }`}>
                <div className="flex items-center gap-2 mb-1 opacity-60">
                  {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                  <span className="text-[10px] uppercase font-bold">{msg.role === 'user' ? 'Siz' : 'Jarvis'}</span>
                </div>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

      </section>

      {/* 🌟 CHAT INPUTI VA YUBORISH TUGMASI (Yangi qism) 🌟 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#111114] via-[#111114] to-transparent z-10">
        <div className="flex items-center gap-2">
          {/* Matn yozish joyi */}
          <div className="flex-1 bg-[#212126] rounded-full flex items-center px-4 py-3.5 border border-gray-700/50 shadow-lg relative">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Habar yozing..."
              className="bg-transparent border-none outline-none text-white w-full pr-8 text-[16px] placeholder-gray-500"
            />
            {/* Yuborish (Send) tugmasi */}
            {inputText.length > 0 && (
              <button onClick={handleSendText} className="absolute right-3 text-blue-500 active:scale-90 transition-transform">
                <Send size={20} />
              </button>
            )}
          </div>

          {/* Ovozli xabar mikrofon */}
          <button onClick={toggleRecording} className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isRecording ? 'bg-red-500 shadow-red-500/40 animate-pulse' : 'bg-blue-600 shadow-blue-600/30'}`}>
            <Mic size={22} className="text-white" />
          </button>
        </div>
      </div>

      {/* 🌟 "KITOB" (HISOB-KITOB) OYNASI - MINI APP ICHIDA 🌟 */}
      {isKitobOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#111114] animate-slide-up">
          <header className="flex justify-between items-center w-full p-4 border-b border-gray-800 bg-[#1a1a1f]">
            <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-green-500" /> Qarz va Rasxodlar Daftari</h2>
            <button onClick={() => setIsKitobOpen(false)} className="p-2 bg-[#212126] rounded-full text-gray-400"><X size={20} /></button>
          </header>

          {/* Jadval qismi */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs text-gray-500 mb-4">Bu yerga Notion'dagi haqiqiy ma'lumotlar n8n orqali tortib kelinadi.</p>

            <div className="bg-[#1a1a1f] rounded-xl overflow-hidden border border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#212126] text-gray-400">
                  <tr>
                    <th className="p-3 font-medium">Kimdan/Kimga</th>
                    <th className="p-3 font-medium">Summa</th>
                    <th className="p-3 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr><td className="p-3">Hasanboy Aka</td><td className="p-3 text-red-400">-$500</td><td className="p-3"><span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-[10px]">Qarz</span></td></tr>
                  <tr><td className="p-3">Suxrob</td><td className="p-3 text-green-400">+$1200</td><td className="p-3"><span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-[10px]">Daromad</span></td></tr>
                  <tr><td className="p-3">Uzum Market</td><td className="p-3 text-yellow-400">-$45</td><td className="p-3"><span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-[10px]">Rasxod</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}