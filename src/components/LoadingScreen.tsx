import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, CheckCircle2, Loader2, Shield, Zap, Database, Cpu, Network } from 'lucide-react';

interface LoadingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'loading' | 'completed';
}

const LoadingScreen: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: 'init', label: 'เริ่มต้นระบบ', icon: <BrainCircuit className="w-5 h-5" />, status: 'pending' },
    { id: 'health', label: 'ตรวจสอบสถานะ AI Models', icon: <Shield className="w-5 h-5" />, status: 'pending' },
    { id: 'connect', label: 'เชื่อมต่อฐานข้อมูล', icon: <Database className="w-5 h-5" />, status: 'pending' },
    { id: 'optimize', label: 'ปรับแต่ง Smart Router', icon: <Zap className="w-5 h-5" />, status: 'pending' },
    { id: 'ready', label: 'เตรียมระบบเสร็จสิ้น', icon: <CheckCircle2 className="w-5 h-5" />, status: 'pending' }
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSteps(prev => {
        const newSteps = [...prev];
        if (currentStep < newSteps.length) {
          if (newSteps[currentStep].status === 'pending') {
            newSteps[currentStep].status = 'loading';
          } else if (newSteps[currentStep].status === 'loading') {
            newSteps[currentStep].status = 'completed';
            if (currentStep < newSteps.length - 1) {
              setCurrentStep(prev => prev + 1);
            }
          }
        }
        return newSteps;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [currentStep]);

  return (
    <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div 
          className="absolute top-20 left-20 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-60"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.6, 0.8, 0.6]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-60"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.6, 0.8, 0.6]
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <div className="relative z-10 max-w-md w-full mx-4">
        {/* Logo Section */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          {/* Logo Icon */}
          <motion.div
            className="mx-auto mb-6 relative"
            animate={{
              scale: [1, 1.05, 1]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl">
              <BrainCircuit className="w-14 h-14 text-white" />
            </div>
            <motion.div
              className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
              animate={{
                scale: [1, 1.2, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <CheckCircle2 className="w-5 h-5 text-white" />
            </motion.div>
          </motion.div>

          {/* Logo Text */}
          <h1 className="text-4xl md:text-5xl font-black text-zinc-900 mb-2 tracking-tight">
            พลิกเกมกลโกง
          </h1>
          <p className="text-lg md:text-xl text-zinc-600 font-medium mb-4">
            AI ตรวจจับคำตอบที่สร้างโดยปัญญาประดิษฐ์
          </p>
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full"
            animate={{
              opacity: [0.6, 1, 0.6]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-sm font-bold text-blue-600">กำลังโหลด...</span>
          </motion.div>
        </motion.div>

        {/* Loading Steps */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="bg-white/80 backdrop-blur-xl border border-zinc-200 rounded-3xl p-6 shadow-2xl"
        >
          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-center gap-4"
              >
                <motion.div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                    step.status === 'completed'
                      ? 'bg-green-100 text-green-600'
                      : step.status === 'loading'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-zinc-100 text-zinc-400'
                  }`}
                  animate={step.status === 'loading' ? {
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0]
                  } : {}}
                  transition={{
                    duration: 0.6,
                    repeat: step.status === 'loading' ? Infinity : 0
                  }}
                >
                  {step.status === 'loading' ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : step.status === 'completed' ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    step.icon
                  )}
                </motion.div>

                <div className="flex-1">
                  <p className={`text-sm font-medium transition-colors ${
                    step.status === 'completed'
                      ? 'text-green-600'
                      : step.status === 'loading'
                      ? 'text-blue-600'
                      : 'text-zinc-400'
                  }`}>
                    {step.label}
                  </p>
                  {step.status === 'loading' && (
                    <motion.div
                      className="h-1 bg-blue-200 rounded-full mt-2 overflow-hidden"
                    >
                      <motion.div
                        className="h-full bg-blue-600 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.8 }}
                      />
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Overall Progress */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 pt-6 border-t border-zinc-200"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                ความคืบหน้ารวม
              </span>
              <span className="text-xs font-bold text-blue-600">
                {Math.round((steps.filter(s => s.status === 'completed').length / steps.length) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"
                initial={{ width: '0%' }}
                animate={{
                  width: `${(steps.filter(s => s.status === 'completed').length / steps.length) * 100}%`
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        </motion.div>

        {/* Bottom Status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-center"
        >
          <p className="text-xs text-zinc-400 font-medium">
            กำลังเตรียมระบบ Smart Intelligent Router (SIR)
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoadingScreen;
