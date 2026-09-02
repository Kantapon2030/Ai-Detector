import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  BrainCircuit, 
  RefreshCw, 
  Upload, 
  FileText, 
  File, 
  X,
  AlertTriangle,
  CheckCircle2,
  Zap,
  History,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Activity,
  Wind
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  query, 
  where, 
  limit, 
  getDocs,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import mammoth from 'mammoth';
import { db, auth } from '../firebase';
import GaugeMeter from '../components/GaugeMeter';
import Logo from '../components/Logo';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import FloatingParticles from '../components/FloatingParticles';
import { PatternsProvider, usePatterns } from '../contexts/PatternsContext';
import { findSimilarPatterns, StoredPattern } from '../lib/vectorEngine';

interface HeatmapSegment {
  text: string;
  score: number;
}

interface AnalysisResult {
  score: number;
  confidenceScore: number;
  verdict?: 'AI Generated' | 'Human Written' | 'Mixed / Uncertain' | string;
  reasoning: string;
  heatmap: HeatmapSegment[];
  analysisDetails: {
    grammar: string;
    depth: string;
    wordUsage: string;
  };
  modelUsed?: string;
  latency?: number;
  isCorrected?: boolean;
}

interface ApiHealthState {
  status: 'healthy' | 'unhealthy' | 'checking';
  provider?: string;
  model?: string;
  latency?: number;
  error?: string;
  details?: string;
  timestamp?: string;
}

const PublicHomeWrapper: React.FC = () => {
  return (
    <PatternsProvider>
      <PublicHome />
    </PatternsProvider>
  );
};

const PublicHome: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<'none' | 'submitting' | 'submitted'>('none');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeType, setDisputeType] = useState<'claim_human' | 'claim_ai'>('claim_human');
  const [isCached, setIsCached] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthState>({ status: 'checking' });
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Client-side in-memory cache
  const analysisCache = useRef<Map<string, AnalysisResult>>(new Map());

  // Patterns from context for fast RAG
  const { patterns, setPatterns } = usePatterns();

  const hashText = async (text: string) => {
    const msgUint8 = new TextEncoder().encode(text.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // API Health Check (Background - Non-blocking)
  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (res.ok && data.status === 'healthy') {
        setApiHealth({
          status: 'healthy',
          provider: data.provider || 'OpenTyphoon AI',
          model: data.model || 'typhoon-v2.5-30b-a3b-instruct',
          latency: data.latency,
          timestamp: data.timestamp
        });
      } else {
        setApiHealth({
          status: 'unhealthy',
          provider: data.provider || 'OpenTyphoon AI',
          model: data.model || 'typhoon-v2.5-30b-a3b-instruct',
          error: data.error || 'API Response Error',
          details: data.details || data.message || 'ไม่สามารถติดต่อ OpenTyphoon API ได้',
          timestamp: data.timestamp
        });
      }
    } catch (err: any) {
      setApiHealth({
        status: 'unhealthy',
        provider: 'OpenTyphoon AI',
        error: 'Network Error',
        details: err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์หลังบ้านได้',
        timestamp: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial patterns for RAG in background
  useEffect(() => {
    const loadPatterns = async () => {
      if (patterns && patterns.length > 0) return;
      try {
        const patternsSnap = await getDocs(collection(db, 'patterns'));
        const loadedPatterns = patternsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoredPattern));
        setPatterns(loadedPatterns);
      } catch (err) {
        console.warn('Patterns fetch notice:', err);
      }
    };
    loadPatterns();
  }, [patterns, setPatterns]);

  // Real-time history listener
  useEffect(() => {
    try {
      const q = query(
        collection(db, 'submissions'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const historyItems = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((item: any) => item.status === 'analyzed')
          .slice(0, 10);
        setHistory(historyItems);
      }, (err) => {
        console.warn("History listener notice:", err);
      });
      
      return () => unsubscribe();
    } catch (e) {
      console.warn("Firestore history query notice:", e);
    }
  }, []);

  const isAdmin = user?.email === "tawna20081@gmail.com";

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled') {
        setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const clearForm = () => {
    setInputText('');
    setFile(null);
    setResult(null);
    setError(null);
    setSubmissionId(null);
    setIsCached(false);
    setDisputeStatus('none');
    setDisputeReason('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const allowedExtensions = ['.docx', '.txt', '.md'];
      const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
      
      if (allowedExtensions.includes(fileExt) || selectedFile.type.includes('text') || selectedFile.name.endsWith('.docx')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('รองรับไฟล์ข้อความ (.docx, .txt, .md)');
      }
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const performAnalysis = async () => {
    let textToAnalyze = inputText.trim();

    // If file is provided, extract its text content
    if (file) {
      try {
        if (file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const docxResult = await mammoth.extractRawText({ arrayBuffer });
          textToAnalyze = docxResult.value.trim();
        } else {
          // Plain text / Markdown
          textToAnalyze = await file.text();
        }
      } catch (fileErr: any) {
        setError(`ไม่สามารถอ่านเนื้อหาจากไฟล์ ${file.name} ได้: ${fileErr.message}`);
        return;
      }
    }

    if (!textToAnalyze) {
      setError('กรุณาป้อนข้อความหรืออัปโหลดไฟล์ที่มีข้อความ');
      return;
    }

    if (apiHealth.status === 'unhealthy') {
      setError(`⚠️ ระบบ Typhoon AI กำลังไม่พร้อมใช้งาน (${apiHealth.error || 'Offline'}): ${apiHealth.details || 'กรุณาตรวจสอบการตั้งค่า API Key'}`);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setSubmissionId(null);
    setIsCached(false);
    setAnalysisProgress(10);

    const progressTimer = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev < 80) return prev + 15;
        if (prev < 95) return prev + 3;
        return prev;
      });
    }, 150);

    try {
      const textHash = await hashText(textToAnalyze);

      // 1. In-memory client cache check
      if (analysisCache.current.has(textHash)) {
        const cached = analysisCache.current.get(textHash)!;
        setResult(cached);
        setIsCached(true);
        setIsAnalyzing(false);
        setAnalysisProgress(100);
        clearInterval(progressTimer);
        return;
      }

      // 2. Server-side Firestore cache check
      try {
        const q = query(
          collection(db, 'submissions'),
          where('textHash', '==', textHash),
          limit(5)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docs = [...snap.docs];
          const correctedDoc = docs.find(d => d.data().status === 'corrected');
          const analyzedDoc = docs.find(d => d.data().status === 'analyzed' && !d.data().disputed);

          const targetDoc = correctedDoc || analyzedDoc;
          if (targetDoc) {
            const subId = targetDoc.id;
            const resQ = query(collection(db, 'analysisResults'), where('submissionId', '==', subId), limit(1));
            const resSnap = await getDocs(resQ);
            
            if (!resSnap.empty) {
              const resData = resSnap.docs[0].data();
              const cachedRes: AnalysisResult = {
                score: resData.cheatingScore,
                confidenceScore: resData.confidenceScore || 95,
                verdict: resData.verdict || (resData.cheatingScore > 50 ? 'AI Generated' : 'Human Written'),
                reasoning: resData.reasoning,
                heatmap: resData.heatmap || [],
                analysisDetails: resData.analysisDetails || {
                  grammar: "N/A",
                  depth: "N/A",
                  wordUsage: "N/A"
                },
                modelUsed: resData.modelUsed || "Typhoon 2.5 Instruct",
                isCorrected: !!correctedDoc
              };

              analysisCache.current.set(textHash, cachedRes);
              setResult(cachedRes);
              setSubmissionId(subId);
              setIsCached(true);
              setIsAnalyzing(false);
              setAnalysisProgress(100);
              clearInterval(progressTimer);
              return;
            }
          }
        }
      } catch (cacheErr) {
        console.warn('Firestore cache lookup skipped:', cacheErr);
      }

      // 3. RAG Knowledge retrieval using our fast local vector engine
      let ragContext = "";
      if (patterns && patterns.length > 0) {
        const similar = findSimilarPatterns(textToAnalyze, patterns as StoredPattern[], 0.3, 3);
        if (similar.length > 0) {
          ragContext = "**ข้อมูลการตัดสินก่อนหน้าจากผู้ดูแลระบบ (Admin Learning Context)**:\n" +
            similar.map(p => `- คำตัดสิน: ${p.label === 'cheating' ? 'AI (สร้างโดยปัญญาประดิษฐ์)' : 'มนุษย์ (เขียนโดยมนุษย์)'}\n  ตัวอย่างข้อความ: ${p.text.slice(0, 200)}...`).join('\n');
        }
      }

      // 4. Call Typhoon AI API Proxy
      const response = await fetch('/api/analyze-typhoon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: textToAnalyze,
          ragContext: ragContext || undefined
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `เซิร์ฟเวอร์ตอบกลับด้วยรหัส ${response.status}`);
      }

      const analysisData: AnalysisResult = await response.json();
      
      setResult(analysisData);
      analysisCache.current.set(textHash, analysisData);
      setAnalysisProgress(100);

      // 5. Store to Firestore asynchronously in background
      try {
        const subDoc = await addDoc(collection(db, 'submissions'), {
          text: textToAnalyze.slice(0, 5000),
          textHash: textHash,
          status: 'analyzed',
          modelUsed: 'typhoon-v2.5-30b-a3b-instruct',
          timestamp: new Date().toISOString(),
          isAnonymous: true,
          disputed: false
        });

        setSubmissionId(subDoc.id);

        await addDoc(collection(db, 'analysisResults'), {
          submissionId: subDoc.id,
          cheatingScore: analysisData.score,
          confidenceScore: analysisData.confidenceScore,
          verdict: analysisData.verdict || (analysisData.score > 50 ? 'AI Generated' : 'Human Written'),
          reasoning: analysisData.reasoning,
          analysisDetails: analysisData.analysisDetails,
          heatmap: analysisData.heatmap,
          modelUsed: 'Typhoon 2.5 Instruct',
          timestamp: new Date().toISOString()
        });
      } catch (dbErr) {
        console.warn('Firestore store notice:', dbErr);
      }

    } catch (err: any) {
      console.error("Analysis failed:", err);
      setError(err.message || 'เกิดข้อผิดพลาดในการวิเคราะห์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      clearInterval(progressTimer);
      setIsAnalyzing(false);
    }
  };

  const handleDispute = async () => {
    if (!submissionId) return;
    setDisputeStatus('submitting');
    try {
      const subRef = doc(db, 'submissions', submissionId);
      await updateDoc(subRef, {
        disputed: true,
        disputeTimestamp: serverTimestamp(),
        disputeType: disputeType,
        disputeReason: disputeReason
      });
      setDisputeStatus('submitted');
    } catch (err) {
      console.error("Dispute failed:", err);
      setError('ไม่สามารถส่งคำโต้แย้งได้ในขณะนี้');
      setDisputeStatus('none');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-zinc-900 font-sans selection:bg-blue-500/30 relative overflow-hidden">
      {/* Background Animated Atmosphere */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <FloatingParticles />
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-indigo-100/30 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] bg-sky-100/20 rounded-full blur-[150px]" />
      </div>

      {/* Header */}
      <header className="h-16 md:h-24 border-b border-zinc-200/50 flex items-center justify-between px-4 md:px-8 sticky top-0 bg-white/70 backdrop-blur-xl z-40">
        <Logo />
        
        <div className="flex items-center gap-2 md:gap-4">
          {/* Typhoon API Health Badge */}
          <button
            onClick={() => setShowHealthModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 border border-zinc-200/70 rounded-full shadow-sm backdrop-blur-sm hover:bg-zinc-50 transition-all text-left"
            title="คลิกเพื่อดูรายละเอียดสถานะ Typhoon API"
          >
            {apiHealth.status === 'checking' ? (
              <>
                <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
                <span className="text-[10px] md:text-xs font-mono font-bold text-zinc-500 uppercase tracking-wider">กำลังตรวจสอบ Typhoon...</span>
              </>
            ) : apiHealth.status === 'healthy' ? (
              <>
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[10px] md:text-xs font-mono font-bold text-emerald-700 uppercase tracking-wider">
                  Typhoon 2.5 พร้อม ({apiHealth.latency ? `${apiHealth.latency}ms` : 'Online'})
                </span>
              </>
            ) : (
              <>
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
                <span className="text-[10px] md:text-xs font-mono font-bold text-red-600 uppercase tracking-wider">
                  Typhoon API ออฟไลน์
                </span>
              </>
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] md:text-xs font-bold text-zinc-900 line-clamp-1 max-w-[120px]">{user.displayName || user.email}</span>
                <span className="text-[8px] md:text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{isAdmin ? 'Admin' : 'User'}</span>
              </div>
              {isAdmin && (
                <a 
                  href="/admin"
                  className="p-2 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-all shadow-sm text-zinc-400 hover:text-blue-500"
                  title="จัดการระบบแอดมิน"
                >
                  <Shield className="w-4 h-4" />
                </a>
              )}
              <button 
                onClick={logout}
                className="p-2 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-all shadow-sm"
                title="ออกจากระบบ"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          ) : (
            <button 
              onClick={login}
              className="px-4 py-2 bg-zinc-900 text-white text-[10px] md:text-xs font-black rounded-full uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg"
            >
              Admin Login
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-12 relative z-10">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto pt-2 md:pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200/80 rounded-full text-xs font-bold text-blue-700 shadow-sm">
            <Wind className="w-4 h-4 text-blue-600 animate-pulse" />
            <span>ขับเคลื่อนด้วย OpenTyphoon AI 2.5 (30B Instruct)</span>
          </div>

          <h2 className="text-2xl md:text-5xl font-serif font-black tracking-tight text-zinc-900 leading-tight">
            ตรวจจับเนื้อหาจาก AI อย่างแม่นยำ
          </h2>
          
          <p className="text-zinc-600 text-sm md:text-lg leading-relaxed">
            วิเคราะห์ความเป็นมนุษย์ vs AI ด้วยสถาปัตยกรรมภาษาศาสตร์คอมพิวเตอร์และโมเดลภาษาไทยระดับแนวหน้า
          </p>
        </section>

        {/* Input Card */}
        <section className="bg-white/90 border border-zinc-200/80 rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.06)] backdrop-blur-2xl overflow-hidden">
          <div className="p-6 md:p-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest font-bold">
                  ข้อความที่ต้องการตรวจสอบ
                </label>
                <span className="text-xs font-mono text-zinc-400">
                  {inputText.length} ตัวอักษร
                </span>
              </div>

              <div className="relative overflow-hidden rounded-2xl">
                <textarea 
                  placeholder="วางข้อความที่ต้องการตรวจสอบที่นี่ (รองรับทั้งภาษาไทยและภาษาอังกฤษ)..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="w-full h-48 md:h-60 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 md:p-6 font-sans text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none leading-relaxed"
                />
                
                {isAnalyzing && (
                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-zinc-200 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* File Upload & Clear */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest font-bold block mb-2">
                  หรือ อัปโหลดไฟล์ (.docx, .txt, .md)
                </label>
                
                {file ? (
                  <div className="flex items-center justify-between p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-900 line-clamp-1">{file.name}</p>
                        <p className="text-[10px] font-mono text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={removeFile}
                      className="p-1.5 hover:bg-blue-100 rounded-full text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input 
                      type="file" 
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".docx,.txt,.md"
                    />
                    <label 
                      htmlFor="file-upload"
                      className="flex items-center justify-center gap-3 w-full py-3.5 border-2 border-dashed border-zinc-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                    >
                      <Upload className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                      <span className="text-xs font-medium text-zinc-600 group-hover:text-blue-600">
                        เลือกไฟล์เพื่ออัปโหลด
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2 md:pt-6">
                {(inputText || file || result) && (
                  <button 
                    onClick={clearForm}
                    className="px-5 py-3.5 border border-zinc-200 rounded-2xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-all flex items-center justify-center gap-2 font-bold text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    ล้างฟอร์ม
                  </button>
                )}
              </div>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs font-medium text-red-700">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">เกิดข้อผิดพลาดในการตรวจสอบ:</p>
                  <p className="leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button 
              onClick={performAnalysis}
              disabled={isAnalyzing || (!inputText && !file)}
              className="w-full py-4 md:py-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:from-blue-700 hover:to-indigo-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-blue-500/20 text-sm md:text-base cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  กำลังส่งข้อมูลวิเคราะห์ผ่าน Typhoon 2.5 AI...
                </>
              ) : (
                <>
                  <BrainCircuit className="w-5 h-5" />
                  เริ่มตรวจสอบความโปร่งใสของข้อมูล
                </>
              )}
            </button>
          </div>
        </section>

        {/* Results Section */}
        {result && (
          <motion.section 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {result.isCorrected && (
              <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 shadow-sm w-fit mx-auto">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>ผลลัพธ์นี้ได้รับการยืนยันความถูกต้องโดยผู้ดูแลระบบแล้ว (Admin Confirmed)</span>
              </div>
            )}

            {isCached && !result.isCorrected && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700 uppercase tracking-widest w-fit mx-auto">
                <History className="w-3.5 h-3.5" />
                แสดงผลจากหน่วยความจำแคช (Cached Result)
              </div>
            )}

            <div className="bg-white border border-zinc-200 rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl p-6 md:p-10 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
                
                {/* Left: Gauge & Verdict */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-full max-w-[300px] flex flex-col items-center">
                    <GaugeMeter score={result.score} label="โอกาสเป็น AI" />
                    
                    <div 
                      className={cn(
                        "mt-[-25px] px-6 py-2 text-white text-xs font-black rounded-full uppercase tracking-widest shadow-xl z-20",
                        result.score >= 50 ? "bg-red-500 shadow-red-500/30" : "bg-emerald-500 shadow-emerald-500/30"
                      )}
                    >
                      {result.score >= 50 ? 'AI Generated (สร้างโดย AI)' : 'Human Written (มนุษย์เขียน)'}
                    </div>
                  </div>

                  <div className="mt-2 text-center space-y-1">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                      <Zap className="w-3 h-3 text-blue-500" />
                      วิเคราะห์โดย Typhoon 2.5 30B Instruct
                    </div>
                    {result.confidenceScore && (
                      <p className="text-[11px] font-mono text-zinc-400">
                        ความมั่นใจของผลลัพธ์: {result.confidenceScore}%
                      </p>
                    )}
                  </div>

                  <div className="flex gap-6 justify-center pt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-xs font-mono text-zinc-500 font-bold uppercase">AI / ทุจริต</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-xs font-mono text-zinc-500 font-bold uppercase">มนุษย์ / ปกติ</span>
                    </div>
                  </div>
                </div>

                {/* Right: Reasoning & Multi-Persona Details */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <BrainCircuit className="w-5 h-5 text-blue-600" />
                      <h3 className="text-xl md:text-2xl font-serif font-black text-zinc-900">
                        บทสรุปและเหตุผลเชิงลึก
                      </h3>
                    </div>
                    <div className="h-1 w-12 bg-blue-600 rounded-full" />
                  </div>

                  <div className="prose prose-zinc prose-sm max-w-none text-zinc-700 leading-relaxed bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <Markdown>{result.reasoning}</Markdown>
                  </div>

                  {result.analysisDetails && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                        มิติการวิเคราะห์ภาษาศาสตร์ (Stylometry Dimensions)
                      </h4>
                      <div className="space-y-2">
                        <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-blue-700">1. ไวยากรณ์และความสม่ำเสมอ:</span>
                          <p className="text-zinc-600 leading-relaxed">{result.analysisDetails.grammar}</p>
                        </div>
                        <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-blue-700">2. ความลึกซึ้งและอารมณ์ของเนื้อหา:</span>
                          <p className="text-zinc-600 leading-relaxed">{result.analysisDetails.depth}</p>
                        </div>
                        <div className="p-3 bg-zinc-50 border border-zinc-200/70 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-blue-700">3. คำเชื่อมและสำนวนสำเร็จรูป:</span>
                          <p className="text-zinc-600 leading-relaxed">{result.analysisDetails.wordUsage}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Heatmap Section */}
              {result.heatmap && result.heatmap.length > 0 && (
                <div className="space-y-4 pt-6 border-t border-zinc-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      ระดับความน่าจะเป็นของแต่ละประโยค (Sentence-Level Heatmap)
                    </h4>
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-emerald-600 font-bold">● มนุษย์ (&lt;50%)</span>
                      <span className="text-red-500 font-bold">● AI (&gt;50%)</span>
                    </div>
                  </div>

                  <div className="p-5 bg-zinc-50 border border-zinc-200/70 rounded-2xl leading-relaxed text-zinc-800 text-sm md:text-base space-y-1 font-sans">
                    {result.heatmap.map((seg, i) => {
                      const isAI = seg.score >= 50;
                      const opacity = Math.abs(seg.score - 50) / 50 * 0.25 + 0.08;
                      const bgColor = isAI ? `rgba(239, 68, 68, ${opacity})` : `rgba(16, 185, 129, ${opacity})`;
                      const borderColor = isAI ? `rgba(239, 68, 68, 0.4)` : `rgba(16, 185, 129, 0.4)`;

                      return (
                        <span 
                          key={i}
                          style={{ backgroundColor: bgColor, borderBottom: `2px solid ${borderColor}` }}
                          className="px-1.5 py-0.5 rounded mr-1.5 inline-block cursor-help transition-all hover:brightness-90"
                          title={`โอกาสเป็น AI: ${seg.score}%`}
                        >
                          {seg.text}
                          <span className="text-[10px] font-mono text-zinc-400 ml-1 font-normal">({seg.score}%)</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Dispute Button */}
              {submissionId && disputeStatus === 'none' && (
                <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <span className="text-xs text-zinc-500">
                    ไม่เห็นด้วยกับผลการวิเคราะห์นี้? คุณสามารถยื่นคำโต้แย้งเพื่อให้แอดมินตรวจสอบซ้ำได้
                  </span>
                  <button
                    onClick={() => setDisputeStatus('submitting')}
                    className="px-4 py-2 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-colors shrink-0"
                  >
                    ยื่นคำโต้แย้งผลลัพธ์
                  </button>
                </div>
              )}

              {/* Dispute Modal/Form */}
              {disputeStatus === 'submitting' && (
                <div className="p-5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">ยื่นคำโต้แย้งผลการวิเคราะห์</h4>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                        <input
                          type="radio"
                          name="disputeType"
                          value="claim_human"
                          checked={disputeType === 'claim_human'}
                          onChange={() => setDisputeType('claim_human')}
                        />
                        <span>ฉันยืนยันว่าข้อความนี้เป็น <strong>"มนุษย์เขียน"</strong></span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                        <input
                          type="radio"
                          name="disputeType"
                          value="claim_ai"
                          checked={disputeType === 'claim_ai'}
                          onChange={() => setDisputeType('claim_ai')}
                        />
                        <span>ฉันยืนยันว่าข้อความนี้เป็น <strong>"AI สร้าง"</strong></span>
                      </label>
                    </div>

                    <textarea
                      placeholder="ระบุเหตุผลประกอบคำโต้แย้ง (เช่น เป็นผลงานที่เขียนเองทั้งหมด, มีหลักฐานร่างงาน)..."
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      className="w-full h-20 p-3 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDisputeStatus('none')}
                        className="px-3 py-1.5 border border-zinc-200 rounded-lg text-xs text-zinc-500 hover:bg-white"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleDispute}
                        disabled={!disputeReason.trim()}
                        className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                      >
                        ส่งคำโต้แย้ง
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {disputeStatus === 'submitted' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs text-emerald-800 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>ส่งคำโต้แย้งเรียบร้อยแล้ว แอดมินจะทำการตรวจสอบเพื่อปรับปรุงโมเดลต่อไป ขอบคุณครับ</span>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </main>

      {/* API Health Detail Modal */}
      <AnimatePresence>
        {showHealthModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-zinc-900 text-base">สถานะการเชื่อมต่อ AI API</h3>
                </div>
                <button 
                  onClick={() => setShowHealthModal(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500 font-medium">ผู้ให้บริการ AI:</span>
                  <span className="font-bold text-zinc-900">OpenTyphoon AI</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500 font-medium">โมเดลหลัก:</span>
                  <span className="font-mono font-bold text-blue-600">{apiHealth.model || 'typhoon-v2.5-30b-a3b-instruct'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-500 font-medium">สถานะระบบ:</span>
                  <span className={cn("font-bold px-2 py-0.5 rounded", apiHealth.status === 'healthy' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                    {apiHealth.status === 'healthy' ? '✓ พร้อมใช้งาน (Healthy)' : '✗ ไม่พร้อมใช้งาน (Unhealthy)'}
                  </span>
                </div>
                {apiHealth.latency && (
                  <div className="flex justify-between items-center py-1.5 border-b border-zinc-100">
                    <span className="text-zinc-500 font-medium">ความเร็วการตอบสนอง (Latency):</span>
                    <span className="font-mono text-zinc-700 font-bold">{apiHealth.latency} ms</span>
                  </div>
                )}
                {apiHealth.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
                    <span className="font-bold text-red-700 block">รายละเอียดข้อผิดพลาด:</span>
                    <p className="text-red-600 font-mono text-[11px] leading-relaxed">{apiHealth.details || apiHealth.error}</p>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  onClick={() => { checkHealth(); }}
                  className="px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  ทดสอบใหม่
                </button>
                <button 
                  onClick={() => setShowHealthModal(false)}
                  className="px-4 py-2 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-colors text-xs"
                >
                  ปิด
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PublicHomeWrapper;
