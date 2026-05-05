'use client'
import { useEffect, useState } from 'react'
import WebApp from '@twa-dev/sdk'

export default function Home() {
  const [userData, setUserData] = useState<any>(null)

  useEffect(() => {
    // Telegram muhitida ekanligini tekshiramiz
    if (typeof window !== 'undefined' && WebApp.initDataUnsafe.user) {
      setUserData(WebApp.initDataUnsafe.user)
      WebApp.ready() // Mini App tayyor ekanligini Telegramga bildiramiz
      WebApp.expand() // Ekranni to'liq ochish
    }
  }, [])

  return (
    <main className="p-4 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">

      {/* Tepa qism - Foydalanuvchi profil */}
      <div className="flex items-center gap-4 mb-8 p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
        <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-xl text-white font-bold">
          {userData?.first_name?.charAt(0) || 'J'}
        </div>
        <div>
          <h1 className="text-xl font-bold">Salom, {userData?.first_name || 'Xo\'jayin'}!</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Jarvis Boshqaruv Paneli</p>
        </div>
      </div>

      {/* Tezkor Tugmalar (Quick Actions) */}
      <h2 className="text-lg font-semibold mb-4">Tezkor harakatlar</h2>
      <div className="grid grid-cols-2 gap-4">
        <button className="p-4 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl font-medium active:scale-95 transition-transform">
          🚕 Taksi (Yandex)
        </button>
        <button className="p-4 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-2xl font-medium active:scale-95 transition-transform">
          ☕️ Kofe / Tushlik
        </button>
        <button className="p-4 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl font-medium active:scale-95 transition-transform">
          🏠 Obyektlar Xaritasi
        </button>
        <button className="p-4 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-2xl font-medium active:scale-95 transition-transform">
          📊 Oylik Hisobot
        </button>
      </div>

    </main>
  )
}