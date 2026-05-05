'use client'
import { useEffect, useState } from 'react'
import { Mic, Search, Grid, ShoppingCart, Activity, Briefcase, Menu, X, CreditCard, Car, Package } from 'lucide-react'

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)

  // Oynani ochish/yopish uchun state
  const [isAppsOpen, setIsAppsOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@twa-dev/sdk').then((module) => {
        const WebApp = module.default;
        WebApp.ready();
        WebApp.expand();
        WebApp.setHeaderColor('#0f0f0f');
        WebApp.setBackgroundColor('#0f0f0f');
        if (WebApp.initDataUnsafe && WebApp.initDataUnsafe.user) {
          setUserData(WebApp.initDataUnsafe.user);
        }
      });
    }
  }, [])

  // n8n'ga ma'lumot yuboruvchi MAXFIY FUNKSIYA
  const sendToN8n = async (actionName: string) => {
    try {
      // HOZIRCHA TEST UCHUN. Keyin bu yerga n8n Webhook ssilkasini qo'yamiz
      alert(`"${actionName}" bosildi! Bu ma'lumot n8n'ga uchib ketdi 🚀`);

      /* n8n ulanishi uchun tayyor kod (hozircha izohda turadi):
      await fetch('SIZNING_N8N_WEBHOOK_SSILKANGIZ', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foydalanuvchi: userData?.first_name,
          harakat: actionName,
          vaqt: new Date().toISOString()
        })
      });
      */

      setIsAppsOpen(false); // Tugma bosilgach oynani yopamiz
    } catch (error) {
      console.error("Xato yuz berdi:", error);
    }
  }

  return (
    <main className="flex h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden relative">

      {/* CHAP PANEL */}
      <aside className="w-[70px] bg-[#1a1a1f] h-full flex flex-col items-center py-6 gap-6 z-10 shadow-2xl">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-lg font-bold">
          {userData?.first_name?.charAt(0) || 'J'}
        </div>

        <div className="flex flex-col gap-6 mt-4 text-gray-400">
          <button className="flex flex-col items-center gap-1 hover:text-white transition-colors">
            <Activity size={24} />
            <span className="text-[10px]">Shifo24</span>
          </button>

          {/* BARCHA ILOVALAR TUGMASI - SHUNI BOSGANDA OYNA OCHILADI */}
          <button
            onClick={() => setIsAppsOpen(true)}
            className="flex flex-col items-center gap-1 mt-2 text-blue-400 relative active:scale-95 transition-transform"
          >
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
      <section className="flex-1 flex flex-col px-6 py-8">
        <header className="flex justify-between items-center w-full">
          <div className="bg-[#1a1a1f] p-2 rounded-full cursor-pointer">
            <Menu size={20} className="text-gray-300" />
          </div>
          <h1 className="text-gray-400 font-medium tracking-widest text-sm uppercase">Jarvis AI 📍</h1>
          <div className="w-8 h-8 rounded-full border border-gray-700 bg-[#1a1a1f]"></div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center -mt-10">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 bg-blue-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            <div className="relative w-full h-full bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-2xl">
              <span className="text-4xl">🤖</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold mb-2">Salom, {userData?.first_name || 'Xo\'jayin'}</h2>
          <p className="text-gray-400 text-center">Men sizning shaxsiy yordamchingizman.<br />Bugun qanday yordam bera olaman?</p>
        </div>

        <div className="absolute bottom-8 left-6 right-6 flex items-center gap-3 pl-[70px]">
          <div className="flex-1 bg-[#1a1a1f] rounded-2xl flex items-center px-4 py-3 border border-gray-800/50">
            <Search size={20} className="text-gray-500 mr-3" />
            <input type="text" placeholder="Yozing yoki ovoz..." className="bg-transparent border-none outline-none text-white w-full text-sm" />
          </div>
          <button onClick={() => setIsRecording(!isRecording)} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 animate-bounce' : 'bg-blue-600'}`}>
            <Mic size={24} className="text-white" />
          </button>
        </div>
      </section>

      {/* 🌟 QALQIB CHIQUVCHI OYNA (MODAL) - Barcha Ilovalar 🌟 */}
      {isAppsOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          {/* Animatsiya bilan tepaga chiquvchi oyna */}
          <div className="w-full h-[70%] bg-[#121216] rounded-t-3xl p-6 relative border-t border-gray-800 flex flex-col animate-slide-up">

            {/* Yopish tugmasi */}
            <button
              onClick={() => setIsAppsOpen(false)}
              className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold mb-6 mt-2">Barcha xizmatlar</h3>

            {/* Ilovalar Ro'yxati (Grid) */}
            <div className="grid grid-cols-3 gap-4">

              <button onClick={() => sendToN8n("Moliya va Kartalar")} className="flex flex-col items-center gap-2 p-4 bg-[#1a1a1f] rounded-2xl active:scale-95 transition-transform border border-gray-800/50">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500"><CreditCard size={24} /></div>
                <span className="text-xs font-medium">Moliya</span>
              </button>

              <button onClick={() => sendToN8n("Yandex Taksi Chaquirish")} className="flex flex-col items-center gap-2 p-4 bg-[#1a1a1f] rounded-2xl active:scale-95 transition-transform border border-gray-800/50">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center text-yellow-500"><Car size={24} /></div>
                <span className="text-xs font-medium">Yandex</span>
              </button>

              <button onClick={() => sendToN8n("Uzum Market Xaridlari")} className="flex flex-col items-center gap-2 p-4 bg-[#1a1a1f] rounded-2xl active:scale-95 transition-transform border border-gray-800/50">
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-500"><Package size={24} /></div>
                <span className="text-xs font-medium">Uzum</span>
              </button>

            </div>
          </div>
        </div>
      )}

    </main>
  )
}