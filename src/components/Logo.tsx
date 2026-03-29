import React from 'react';
import { Search, Cpu } from 'lucide-react';

const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="relative">
        {/* Blue Square Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/40 border border-blue-400/30">
          <span className="text-white font-black text-2xl tracking-tighter">AI</span>
        </div>
        {/* Magnifying Glass Overlay */}
        <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full shadow-md border border-zinc-100">
          <Search className="w-6 h-6 text-orange-500 stroke-[3]" />
        </div>
      </div>
      
      <div className="flex flex-col">
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent drop-shadow-sm font-serif">
          พลิกเกมกลโกง
        </h1>
        <p className="text-zinc-500 text-sm font-medium tracking-tight -mt-1">
          ตรวจจับคำตอบที่สร้างโดยปัญญาประดิษฐ์
        </p>
      </div>
    </div>
  );
};

export default Logo;
