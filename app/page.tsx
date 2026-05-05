'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Search, Grid, ShoppingCart, Activity, Briefcase, Menu, X, CreditCard, Car, Package, ChevronLeft, Bookmark, RotateCcw } from 'lucide-react'

// 👇 MANA SHU YERGA N8N WEBHOOK SSILKANGIZNI QO'YING:
const N8N_WEBHOOK_URL = "https://abusaidbakrdov.app.n8n.cloud/webhook-test/8bafdcfb-2d60-4698-ad3e-920c16074495";

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isAppsOpen, setIsAppsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false) // Yuklanish jarayoni uchun

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])

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

  // 🚀 ASOSIY FUNKSIYA: N8N GA MA'LUMOT VA OVOZ JO'NATISH
  const sendToN8n = async (actionType: string, audioBlob: Blob | null = null) => {
    setIsLoading(true);
    try {
      if (audioBlob) {
        // Agar ovoz bo'lsa, uni fayl sifatida (FormData) jo'natamiz
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice_message.webm');
        formData.append('action', 'voice_command');
        formData.append('user_first_name', userData?.first_name || 'Noma\'lum');
        formData.append('user_id', userData?.id?.toString() || '0');

        await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          body: formData,
        });
        alert("🎤 Ovozli buyruq AI'ga yuborildi!");
      } else {
        // Agar oddiy tugma bosilsa, matn sifatida (JSON) jo'natamiz
        await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: actionType,
            user_first_name: userData?.first_name || 'Noma\'lum',
            user_id: userData?.id || 0,
            timestamp: new Date().toISOString()
          }),
        });
        alert(`✅ "${actionType}" AI'ga yuborildi!`);
      }
    } catch (error) {
      console.error("Xato:", error);
      alert("n8n ga ulanishda xatolik! Ssilkani to'g'ri qo'yganingizni tekshiring.");
    } finally {
      setIsLoading(false);
      setIsAppsOpen(false); // Oynani yopish
    }
  }

  // Ovoz yozish mantiqi
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          // Yozib bo'lingach, faylni n8n'ga otamiz!
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          sendToN8n('voice_command', audioBlob);
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

      {/* Tepadagi yuklanish indikatori */}
      {isLoading && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 animate-pulse z-50"></div>}

      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#2c2c31]/80 backdrop-blur-md px-1 py-4 rounded-r-xl flex flex-col items-center gap-2 z-20 shadow-lg">
          <Grid size={14} className="text-blue-400" />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="text-[10px] text-gray-300 font-bold tracking-widest mt-1">SUPER APP</span>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 w-[70px] bg-[#1a1a1f] flex flex-col items-center py-6 gap-6 z-40 transition-transform duration-300 shadow-2xl border-r border-gray-800 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">{userData?.first_name?.charAt(0) || 'J'}</div>
        <button onClick={() => setIsSidebarOpen(false)} className="absolute -right-10 top-1/2 p-2 bg-[#1a1a1f] rounded-r-xl text-gray-400"><ChevronLeft size={20} /></button>
        <div className="flex flex-col gap-6 mt-4 text-gray-400">
          <button onClick={() => sendToN8n('Sidebar_Shifo24')} className="flex flex-col items-center hover:text-white"><Activity size={24} /><span className="text-[10px] mt-1">Shifo24</span></button>
          <button onClick={() => setIsAppsOpen(true)} className="flex flex-col items-center text-blue-400"><Grid size={24} /><span className="text-[10px] mt-1 text-center">Barcha<br />ilovalar</span></button>
        </div>
      </div>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm"></div>}

      <section className="flex-1 flex flex-col px-4 py-4 w-full h-full overflow-y-auto pb-24">
        <header className="flex justify-between items-center w-full mb-8">
          <div className="w-8 h-8 rounded-full border border-gray-700 overflow-hidden bg-[#242429] flex justify-center items-center"><Menu size={16} className="text-gray-400" /></div>
          <div className="flex items-center bg-[#242429] px-4 py-2 rounded-full border border-gray-800"><span className="text-white font-medium text-sm">TrueGis AI</span></div>
          <div className="flex gap-2"><Bookmark size={20} className="text-gray-400" /><RotateCcw size={20} className="text-gray-400" /></div>
        </header>

        <div className="flex flex-col items-center mb-8">
          <div className="relative w-20 h-20 mb-4">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-2xl opacity-30"></div>
            <div className="relative w-full h-full bg-gradient-to-tr from-blue-500 to-cyan-400 rounded-full flex items-center justify-center shadow-lg"><span className="text-3xl">🤖</span></div>
          </div>
          <h2 className="text-2xl font-bold mb-1">Привет, {userData?.first_name || 'Xo\'jayin'}</h2>
          <p className="text-gray-400 text-sm">Как могу помочь вам сегодня?</p>
        </div>

        <h3 className="text-xs font-bold text-gray-500 tracking-wider mb-4 uppercase">Выберите категорию</h3>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => sendToN8n('Category_Eda')} className="bg-[#212126] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"><span className="text-2xl">🍔</span><span className="text-xs text-gray-300">Еда</span></button>
          <button onClick={() => sendToN8n('Category_Shifo24')} className="bg-[#212126] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"><Activity size={24} className="text-cyan-400" /><span className="text-xs text-gray-300">Shifo24</span></button>
          <button onClick={() => sendToN8n('Category_Uhod')} className="bg-[#212126] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"><Briefcase size={24} className="text-orange-400" /><span className="text-xs text-gray-300">Уход за собой</span></button>
          <button onClick={() => setIsAppsOpen(true)} className="bg-[#212126] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"><Grid size={24} className="text-white" /><span className="text-xs text-gray-300 text-center leading-tight">Все мини<br />приложения</span></button>
          <button onClick={() => sendToN8n('Category_Obyavleniya')} className="bg-[#212126] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"><ShoppingCart size={24} className="text-white" /><span className="text-xs text-gray-300">Объявления</span></button>
        </div>
      </section>

      <div className="fixed bottom-6 left-4 right-4 flex items-center gap-3 z-10">
        <div className="flex-1 bg-[#212126] rounded-full flex items-center px-4 py-3.5 border border-gray-700/50 shadow-lg">
          <Search size={20} className="text-gray-400 mr-2" />
          <input type="text" placeholder="Напишите я найду" className="bg-transparent border-none outline-none text-white w-full text-[16px] placeholder-gray-500" />
        </div>
        <button onClick={toggleRecording} className={`w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${isRecording ? 'bg-red-500 shadow-red-500/40 animate-pulse' : 'bg-blue-600 shadow-blue-600/30'}`}>
          <Mic size={22} className="text-white" />
        </button>
      </div>

      {isAppsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full h-[70%] bg-[#121216] rounded-t-3xl p-6 relative border-t border-gray-800 animate-slide-up">
            <button onClick={() => setIsAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#212126] rounded-full text-gray-400"><X size={20} /></button>
            <h3 className="text-xl font-bold mb-6 mt-2">Все сервисы</h3>
            <div className="grid grid-cols-3 gap-4">
              <button onClick={() => sendToN8n('App_Yandex')} className="flex flex-col items-center gap-2 p-4 bg-[#212126] rounded-2xl"><Car size={24} className="text-yellow-500" /><span className="text-xs">Яндекс</span></button>
              <button onClick={() => sendToN8n('App_Finance')} className="flex flex-col items-center gap-2 p-4 bg-[#212126] rounded-2xl"><CreditCard size={24} className="text-blue-500" /><span className="text-xs">Финансы</span></button>
              <button onClick={() => sendToN8n('App_Uzum')} className="flex flex-col items-center gap-2 p-4 bg-[#212126] rounded-2xl"><Package size={24} className="text-purple-500" /><span className="text-xs">Uzum</span></button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}