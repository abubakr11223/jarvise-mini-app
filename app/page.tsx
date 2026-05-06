'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Search, Grid, Menu, X, Bookmark, FileText, Send, BookOpen, User, Bot, Package, CreditCard, ChevronRight, LayoutDashboard, LogOut, ShoppingBag, Car, PenTool, Coffee, MonitorPlay, Calculator } from 'lucide-react'

// Proxy orqali CORS muammosini hal qilamiz
const N8N_WEBHOOK_URL = "/api/chat";

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [isAppsOpen, setIsAppsOpen] = useState(false)
  const [isKitobOpen, setIsKitobOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const [inputText, setInputText] = useState("")
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([
    { role: 'ai', text: 'Salom! Men **JONKA** - sizning aqlli yordamchingizman 🤖. Nima xizmat?' }
  ])

  // 🌟 DYNAMIC XARAJATLAR JADVALI 🌟
  const [expenses, setExpenses] = useState<{ id: number, name: string, amount: number, type: string }[]>([
    { id: 1, name: 'Ovqatlanish', amount: 50000, type: 'XARAJAT' }
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

  // 🚀 QAT'IY TELEGRAM ICHIDA OCHISH:
  const openApp = (url: string) => {
    if (webApp && webApp.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  const formatMessage = (text: string) => {
    const lines = text.split(/\\n|\n/);
    return lines.map((line, i) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <span key={i}>
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="text-white font-bold">{part.slice(2, -2)}</strong>
            }
            return part;
          })}
          {i !== lines.length - 1 && <br />}
        </span>
      );
    });
  };

  const sendToAI = async (text: string | null, audioBlob: Blob | null = null) => {
    setIsLoading(true);
    if (text) setMessages(prev => [...prev, { role: 'user', text: text }]);
    if (audioBlob) setMessages(prev => [...prev, { role: 'user', text: '🎤 Ovozli xabar...' }]);

    try {
      let response;
      if (audioBlob) {
        const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const formData = new FormData();
        formData.append('audio', audioBlob, `voice.${ext}`);
        formData.append('user_id', userData?.id?.toString() || '0');
        formData.append('is_voice', 'yes');
        response = await fetch(N8N_WEBHOOK_URL, { method: 'POST', body: formData });
      } else {
        response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, user_id: userData?.id || 0 }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = (errData as { error?: string }).error || `Server xatosi: ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      let replyText = data?.reply || data?.response || data?.text || data?.message || data?.output || '';

      if (!replyText && Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        replyText = String(first?.reply || first?.text || first?.message || '');
      }

      if (replyText) {
        // 🌟 XARAJAT KODI QIDIRISH VA JADVALGA QO'SHISH 🌟
        const expenseMatch = replyText.match(/\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/i);
        if (expenseMatch) {
          const newExpense = {
            id: Date.now(),
            name: expenseMatch[1].trim(),
            amount: parseInt(expenseMatch[2].replace(/\D/g, '')) || 0,
            type: expenseMatch[3].trim().toUpperCase()
          };
          setExpenses(prev => [newExpense, ...prev]);
          replyText = replyText.replace(/\[EXPENSE:.*?\]/i, '').trim();
        }
        setMessages(prev => [...prev, { role: 'ai', text: replyText }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: '✅ Qabul qilindi!' }]);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Noma\'lum xato';
      setMessages(prev => [...prev, { role: 'ai', text: `❌ ${msg}` }]);
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
        // Brauzer qo'llaydigan formatni aniqlaymiz
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/mp4';
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
        recorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          stream.getTracks().forEach(t => t.stop());
          sendToAI(null, audioBlob);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        setMessages(prev => [...prev, { role: 'ai', text: "❌ Mikrofon ruxsati yo'q! Sozlamalardan ruxsat bering." }]);
      }
    }
  }

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse z-50"></div>}

      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#1a1a1f]/90 backdrop-blur-md border border-l-0 border-gray-700/80 px-1 py-5 rounded-r-2xl flex flex-col items-center justify-center gap-1 z-20 shadow-[4px_0_15px_rgba(0,0,0,0.5)] active:scale-95 transition-transform"
        >
          <div className="w-1 h-6 bg-blue-500 rounded-full mb-1 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="text-[9px] text-gray-300 font-bold tracking-widest uppercase">Super App</span>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 w-[280px] bg-[#111114] z-50 transform transition-transform duration-300 ease-in-out flex flex-col border-r border-gray-800 shadow-[10px_0_30px_rgba(0,0,0,0.7)] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800 flex items-center gap-4 bg-[#1a1a1f]">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-lg font-bold shadow-lg">
            {userData?.first_name?.charAt(0) || 'A'}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm">{userData?.first_name || 'Abubakr'}</span>
            <span className="text-[10px] text-blue-400 font-bold">JONKA Foydalanuvchisi</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-2">
          <button onClick={() => { setIsSidebarOpen(false); setIsKitobOpen(true) }} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors text-left">
            <div className="flex items-center gap-3"><Calculator size={18} className="text-green-400" /><span className="text-sm font-medium">Moliya / Xarajat</span></div><ChevronRight size={16} className="text-gray-600" />
          </button>
          <button onClick={() => { setIsSidebarOpen(false); openApp('https://notion.so') }} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors text-left">
            <div className="flex items-center gap-3"><FileText size={18} className="text-white" /><span className="text-sm font-medium">Notion Baza</span></div><ChevronRight size={16} className="text-gray-600" />
          </button>
          <button onClick={() => { setIsSidebarOpen(false); setIsAppsOpen(true) }} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors text-left">
            <div className="flex items-center gap-3"><LayoutDashboard size={18} className="text-blue-400" /><span className="text-sm font-medium">Barcha Ilovalar</span></div><ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
      </div>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity"></div>}

      <header className="flex justify-between items-center w-full px-4 py-4 bg-[#111114] border-b border-gray-800/50 shrink-0">
        <div className="w-8 h-8 rounded-full border border-gray-700 bg-[#242429] flex justify-center items-center"><Menu size={16} className="text-gray-400" /></div>
        <div className="flex flex-col items-center">
          <span className="text-white font-bold text-sm">JONKA ✨</span>
          <span className="text-[10px] text-green-400">Online</span>
        </div>
        <div className="flex gap-2"><Bookmark size={20} className="text-gray-400" /></div>
      </header>

      <div className="w-full overflow-x-auto scrollbar-hide shrink-0 bg-[#111114] pb-3 pt-2">
        <div className="flex gap-2 px-4 w-max">
          <button onClick={() => setIsAppsOpen(true)} className="bg-[#1a1a1f] border border-blue-500/30 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <Grid size={14} className="text-blue-400" />
            <span className="text-xs font-medium">Super App</span>
          </button>
          <button onClick={() => openApp('https://uzum.uz')} className="bg-[#1a1a1f] border border-gray-700 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <ShoppingBag size={14} className="text-purple-400" />
            <span className="text-xs font-medium">Uzum</span>
          </button>
          <button onClick={() => openApp('https://go.yandex/')} className="bg-[#1a1a1f] border border-gray-700 rounded-full px-4 py-2 flex items-center gap-2 active:scale-95 transition-transform">
            <Car size={14} className="text-yellow-400" />
            <span className="text-xs font-medium">Taxi</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 pb-[80px]">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 mb-1 opacity-50 px-1">
              {msg.role === 'user' ? <User size={10} /> : <Bot size={10} />}
              <span className="text-[9px] uppercase font-bold tracking-wider">{msg.role === 'user' ? 'Siz' : 'JONKA'}</span>
            </div>
            <div className={`max-w-[85%] rounded-2xl p-3.5 text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-[#1a1a1f] text-gray-300 rounded-tl-sm border border-gray-800'
              }`}>
              {msg.role === 'ai' ? formatMessage(msg.text) : msg.text}
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
              placeholder="JONKA ga yozing..."
              style={{ fontSize: '16px' }}
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 py-3"
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

      {/* 📚 DYNAMIC MOLIYA VA XARAJAT MODALI */}
      {isKitobOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#111114]">
            <h2 className="text-lg font-bold flex items-center gap-2"><Calculator className="text-green-500" /> Moliya va Xarajat</h2>
            <button onClick={() => setIsKitobOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full text-gray-400"><X size={20} /></button>
          </header>
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="bg-[#111114] rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
              <table className="w-full text-left text-[14px]">
                <thead className="bg-[#1a1a1f] text-gray-400 text-xs uppercase">
                  <tr><th className="p-4 font-medium">Toifa</th><th className="p-4 font-medium">Summa</th><th className="p-4 font-medium">Holat</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td className="p-4">{exp.name}</td>
                      <td className={`p-4 font-medium ${exp.type === 'XARAJAT' ? 'text-red-400' : 'text-green-400'}`}>
                        {exp.type === 'XARAJAT' ? '-' : '+'}{exp.amount.toLocaleString()} UZS
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${exp.type === 'XARAJAT' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
                          {exp.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 📱 SUPER APP BARCHA ILOVALAR KANALOGI */}
      {isAppsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full h-[75%] bg-[#111114] rounded-t-[30px] p-6 relative border-t border-gray-800 animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-y-auto">
            <button onClick={() => setIsAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full text-gray-400"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 mt-2 text-white">Xizmatlar</h2>

            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">🛍 Marketpleys</h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <button onClick={() => openApp('https://uzum.uz')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform"><div className="w-14 h-14 bg-purple-600/20 border border-purple-500/30 rounded-[18px] flex items-center justify-center shadow-lg"><ShoppingBag size={24} className="text-purple-500" /></div><span className="text-[11px] text-gray-300">Uzum</span></button>
              <button onClick={() => openApp('https://lavka.yandex.ru/')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform"><div className="w-14 h-14 bg-yellow-500/20 border border-yellow-500/30 rounded-[18px] flex items-center justify-center shadow-lg"><Coffee size={24} className="text-yellow-500" /></div><span className="text-[11px] text-gray-300">Lavka</span></button>
            </div>

            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">🚕 Transport</h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <button onClick={() => openApp('https://go.yandex/')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform"><div className="w-14 h-14 bg-yellow-500/20 border border-yellow-500/30 rounded-[18px] flex items-center justify-center shadow-lg"><Car size={24} className="text-yellow-400" /></div><span className="text-[11px] text-gray-300">Yandex Go</span></button>
            </div>

            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">📝 Ish va Baza</h3>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <button onClick={() => openApp('https://notion.so')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform"><div className="w-14 h-14 bg-gray-600/20 border border-gray-500/30 rounded-[18px] flex items-center justify-center shadow-lg"><FileText size={24} className="text-white" /></div><span className="text-[11px] text-gray-300">Notion</span></button>
              <button onClick={() => openApp('https://figma.com')} className="flex flex-col items-center gap-2 active:scale-95 transition-transform"><div className="w-14 h-14 bg-pink-600/20 border border-pink-500/30 rounded-[18px] flex items-center justify-center shadow-lg"><PenTool size={24} className="text-pink-400" /></div><span className="text-[11px] text-gray-300">Figma</span></button>
            </div>

          </div>
        </div>
      )}
    </main>
  )
}