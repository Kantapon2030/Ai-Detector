// Smart Intelligent Router (SIR) - Utility functions for intelligent API routing

export type InputType = 'file' | 'text';

export interface Specialization {
  needsSpeed: boolean;
  needsCompactness: boolean;
  needsThaiExpertise: boolean;
}

export interface ModelRouting {
  primary: string;
  fallback: string[];
}

export interface ModelHealth {
  status: 'ok' | 'error';
  latency?: number;
  message?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  totalModels: number;
  workingModels: number;
  models: Record<string, ModelHealth>;
}

// Input Classifier: จำแนกประเภทข้อมูล
export function classifyInput(file: File | null, text: string): InputType {
  if (file) return 'file';
  if (text.trim()) return 'text';
  return 'text'; // Default fallback
}

// Specialization Detection: ตรวจสอบความถนัดเฉพาะทางของข้อมูล
export function detectSpecialization(text: string, file: File | null): Specialization {
  const specialization: Specialization = {
    needsSpeed: false,
    needsCompactness: false,
    needsThaiExpertise: false
  };

  // เน้นความเร็ว/โต้ตอบสด: ข้อความสั้น (< 500 ตัวอักษร)
  if (text.length < 500 && !file) {
    specialization.needsSpeed = true;
  }

  // เน้นความกระชับ/เช็คเบื้องต้น: ข้อมูลไม่ซับซ้อน (< 1000 ตัวอักษร และไม่มีไฟล์)
  if (text.length < 1000 && !file) {
    specialization.needsCompactness = true;
  }

  // เน้นภาษาไทยขั้นสูง: ตรวจสอบสำนวนกึ่งทางการหรือวรรณกรรม
  const thaiFormalIndicators = [
    'กรุณา', 'ขอความกรุณา', 'เชิญ', 'อนุญาต', 'ด้วยเกล้าด้วยกระหม่อม',
    'ตามที่', 'ดังนั้น', 'ในลักษณะนี้', 'เพื่อให้', 'อันเนื่องมาจาก',
    'บทบาท', 'หน้าที่', 'ความรับผิดชอบ', 'การดำเนินงาน', 'ประสิทธิภาพ'
  ];
  
  const hasThaiFormal = thaiFormalIndicators.some(indicator => text.includes(indicator));
  const isLongText = text.length > 1500;
  
  if (hasThaiFormal || isLongText) {
    specialization.needsThaiExpertise = true;
  }

  return specialization;
}

// Routing Logic: เลือกโมเดลตามสถาปัตยกรรม SIR
export function selectModel(
  inputType: InputType,
  specialization: Specialization,
  healthStatus?: HealthStatus
): ModelRouting {
  // High-Performance Path (สำหรับไฟล์)
  if (inputType === 'file') {
    return {
      primary: 'gemini-3-flash-preview',
      fallback: ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-live-preview']
    };
  }

  // Auto-Optimization Path (สำหรับข้อความ)
  // Default Priority: thaillm-playground
  let primary = 'thaillm-playground';
  
  // Specialization-based routing
  if (specialization.needsSpeed) {
    primary = 'gemini-3.1-flash-live-preview';
  } else if (specialization.needsCompactness) {
    primary = 'gemini-3.1-flash-lite-preview';
  } else if (specialization.needsThaiExpertise) {
    primary = 'thaillm-playground';
  }

  // Fallback chain for text path
  const fallback: string[] = [];
  
  // สร้าง fallback chain ตามลำดับความสำคัญ
  if (primary !== 'thaillm-playground') {
    fallback.push('thaillm-playground');
  }
  if (primary !== 'gemini-3.1-flash-lite-preview') {
    fallback.push('gemini-3.1-flash-lite-preview');
  }
  if (primary !== 'gemini-3.1-flash-live-preview') {
    fallback.push('gemini-3.1-flash-live-preview');
  }
  fallback.push('gemini-3-flash-preview'); // Final fallback

  // ถ้ามี health status ให้กรองเอาเฉพาะ model ที่พร้อมใช้งาน
  if (healthStatus && healthStatus.models) {
    const workingModels = Object.entries(healthStatus.models)
      .filter(([_, health]) => health.status === 'ok')
      .map(([name, _]) => name);
    
    // ถ้า primary ไม่พร้อม ให้เลือก fallback ตัวแรกที่พร้อม
    if (!workingModels.includes(primary)) {
      const availableFallback = fallback.find(model => workingModels.includes(model));
      if (availableFallback) {
        return {
          primary: availableFallback,
          fallback: fallback.filter(m => m !== availableFallback && workingModels.includes(m))
        };
      }
    }
    
    // กรอง fallback chain ให้เหลือเฉพาะที่พร้อมใช้งาน
    const filteredFallback = fallback.filter(model => workingModels.includes(model));
    return {
      primary,
      fallback: filteredFallback
    };
  }

  return {
    primary,
    fallback
  };
}

// เลือก model ถัดไปจาก fallback chain
export function getNextModel(currentModel: string, fallbackChain: string[]): string | null {
  const currentIndex = fallbackChain.indexOf(currentModel);
  if (currentIndex === -1) {
    return fallbackChain[0] || null;
  }
  return fallbackChain[currentIndex + 1] || null;
}

// ตรวจสอบว่า model พร้อมใช้งานหรือไม่
export function isModelAvailable(model: string, healthStatus?: HealthStatus): boolean {
  if (!healthStatus || !healthStatus.models) return true; // Assume available if no health data
  const health = healthStatus.models[model];
  return health && health.status === 'ok';
}
