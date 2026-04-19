/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User 
} from 'firebase/auth';
import { LogIn, Shield } from 'lucide-react';
import { auth } from './firebase';
import PublicHome from './pages/PublicHome';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login failed:", err);
      // Don't show error for popup-closed or cancelled - this is normal user behavior
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled') {
        alert('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    }
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 text-zinc-400 font-mono">
        กำลังเริ่มต้นระบบ...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Route */}
        <Route path="/" element={<PublicHome />} />

        {/* Admin Route (Protected) */}
        <Route 
          path="/admin" 
          element={
            user && user.email === 'tawna20081@gmail.com' ? (
              <AdminDashboard user={user} />
            ) : user ? (
              <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-900 p-6">
                <div className="w-full max-w-md space-y-8 text-center">
                  <div className="flex justify-center">
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl shadow-xl">
                      <Shield className="w-16 h-16 text-red-600" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-4xl font-bold tracking-tighter font-serif">Access Denied</h1>
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
                  </div>
                  <a href="/" className="block text-xs font-mono text-zinc-400 hover:text-zinc-600 transition-colors">
                    กลับหน้าหลัก
                  </a>
                </div>
              </div>
            ) : (
              <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-900 p-6">
                <div className="w-full max-w-md space-y-8 text-center">
                  <div className="flex justify-center">
                    <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-xl">
                      <Shield className="w-16 h-16 text-blue-600" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-4xl font-bold tracking-tighter font-serif">พลิกเกมกลโกง</h1>
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">ระบบจัดการสำหรับผู้ดูแลระบบ</p>
                  </div>
                  <button 
                    onClick={handleLogin}
                    className="w-full py-4 bg-zinc-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    <LogIn className="w-5 h-5" />
                    เข้าสู่ระบบด้วย Google
                  </button>
                  <a href="/" className="block text-xs font-mono text-zinc-400 hover:text-zinc-600 transition-colors">
                    กลับหน้าหลักสำหรับบุคคลทั่วไป
                  </a>
                </div>
              </div>
            )
          } 
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
