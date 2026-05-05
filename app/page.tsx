'use client'
import { useEffect, useState } from 'react'
import { Mic, Search, Grid, ShoppingCart, Activity, Briefcase, Plus, Menu } from 'lucide-react'

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false) // Ovoz yozish holati

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((module) => {
        const WebApp = module.default;
        WebApp.ready();
        WebApp.expand();
        WebApp.setHeaderColor('#0f0f0f'); // Telegram tepasini ham qop-qora qilish
        WebApp.setBackgroundColor('#0f0f0f');
        if (WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
          setUserData(WebApp.initDataUnsafe.user);
        }
      });
    }
  }, [])

  return (
    // Asosiy fon - qop-qora (TrueGIS stili)
    <main className="flex h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">

      {/* CHAP PANEL (Sidebar) */}
      <aside className="w-[70px] bg-[#1a1a1f] h-full flex flex-col items-center py-6 gap-6 rounded-r-3xl z-10 shadow-2xl">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-500/30">
          {userData?.first_name?.charAt(0) || 'J'}
        </div>

        <div className="flex flex-col gap-6 mt-4 text-gray-400">
          <button className="flex flex-col items-center gap-1 hover:text-white transition-colors">
            <Activity size={24} />
            <span className="text-[10px]">Shifo24</span>
          </button>
          <button className="flex flex-col items-center gap-1 hover:text-white transition-colors">
            <Briefcase size={24} />
            <span className="text-[10px]">Usluga</span>
          </button>

          {/* Barcha ilovalar tugmasi (Ko'k rangda ajralib turadi) */}
          <button className="flex flex-col items-center gap-1 mt-2 text-blue-400 relative">
            <div className="absolute -left-4 w-1 h-8 bg-blue-500 rounded-r-lg"></div>
            <Grid size={24} />
            <span className="text-[10px] text-center leading-tight mt-1">Barcha<br />ilovalar</span>
          </button>

          <button className="flex flex-col items-center gap-1 hover:text-white transition-colors">
            <ShoppingCart size={24} />
            <span className="text-[10px]">E'lonlar</span>
          </button>
        </div>
      </aside>

      {/* ASOSIY OYNA */}
      <section className="flex-1 flex flex-col relative px-6 py-8">

        {/* Tepa qism */}
        <header className="flex justify-between items-center w-full">
          <div className="bg-[#1a1a1f] p-2 rounded-full cursor-pointer">
            <Menu size={20} className="text-gray-300" />
          </div>
          <h1 className="text-gray-400 font-medium tracking-widest text-sm uppercase">Jarvis AI 📍</h1>
          <div className="w-8 h-8 rounded-full border border-gray-700 bg-[#1a1a1f]"></div>
        </header>

        {/* Markaziy qism - AI Agent */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-10">
          {/* Miltillovchi AI Ikonkasi */}
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            <div className="relative w-full h-full bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-2xl">
              <span className="text-4xl">🤖</span>
            </div>
          </div>

          <h2 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            Salom, {userData?.first_name || 'Abubakr'}
          </h2>
          <p className="text-gray-400 text-center">Men sizning shaxsiy yordamchingizman.<br />Bugun qanday yordam bera olaman?</p>
        </div>

        {/* PASTKI OVOZ VA QIDIRUV PANEli */}
        <div className="absolute bottom-8 left-6 right-6 flex items-center gap-3">
          {/* Matn kiritish joyi */}
          <div className="flex-1 bg-[#1a1a1f] rounded-2xl flex items-center px-4 py-3 shadow-lg border border-gray-800/50">
            <Search size={20} className="text-gray-500 mr-3" />
            <input
              type="text"
              placeholder="Yozing yoki ovozli xabar qoldiring..."
              className="bg-transparent border-none outline-none text-white w-full text-sm placeholder-gray-500"
            />
          </div>

          {/* Katta Mikrofon Tugmasi */}
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${isRecording
                ? 'bg-red-500 shadow-red-500/40 animate-bounce'
                : 'bg-blue-600 shadow-blue-600/30 hover:bg-blue-500'
              }`}
          >
            <Mic size={24} className="text-white" />
          </button>
        </div>

      </section>
    </main>
  )
}