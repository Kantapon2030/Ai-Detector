import React from 'react';
import { Search, Cpu } from 'lucide-react';

const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center gap-2 md:gap-4 ${className}`}>
      <div className="relative shrink-0">
        {/* Blue Square Icon */}
        <div className="w-10 h-10 md:w-16 md:h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/40 border border-blue-400/30">
          <span className="text-white font-black text-lg md:text-2xl tracking-tighter">AI</span>
        </div>
        {/* Magnifying Glass Overlay */}
        <div className="absolute -bottom-1 -right-1 md:-bottom-2 md:-right-2 bg-white p-1 md:p-1.5 rounded-full shadow-md border border-zinc-100">
          <Search className="w-3 h-3 md:w-6 md:h-6 text-orange-500 stroke-[3]" />
        </div>
      </div>
      
      <div className="flex flex-col min-w-0">
        <h1 className="text-xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent drop-shadow-sm font-serif truncate">
          พลิกเกมกลโกง
        </h1>
        <p className="text-zinc-500 text-[10px] md:text-sm font-medium tracking-tight -mt-0.5 md:-mt-1 truncate">
          ตรวจจับคำตอบที่สร้างโดยปัญญาประดิษฐ์
        </p>
      </div>
    </div>
  );
};

export default Logo;
