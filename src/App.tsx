/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Search, 
  History, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  ChevronRight, 
  Database,
  BrainCircuit,
  RefreshCw,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import Markdown from 'react-markdown';
import { auth, db } from "./firebase";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ใช้ SDK มาตรฐานตัวเดียวตามคู่มือ
import { GoogleGenAI, Type } from "@google/genai";

// ตั้งค่า Gemini API
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Submission {
  id: string;
  text: string;
  status: 'pending' | 'analyzed' | 'corrected';
  timestamp: string;
}

interface AnalysisResult {
  id: string;
  submissionId: string;
  cheatingScore: number;
  reasoning: string;
  similarCases: string[];
  timestamp: string;
}

interface CheatingPattern {
  id: string;
  text: string;
  description: string;
  label: 'cheating' | 'not_cheating';
  embedding: number[];
  timestamp: string;
}

// --- Helper Functions ---
async function getEmbedding(text: string) {
  try {
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [text],
    });
    return response.embeddings[0].values;
  } catch (error) {
    console.warn("⚠️ Embedding failed, using fallback:", error);
    return new Array(768).fill(0);
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- Main Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'submit' | 'history' | 'admin'>('submit');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [patterns, setPatterns] = useState<CheatingPattern[]>([]);
  const [analysisResults, setAnalysisResults] = useState<Record<string, AnalysisResult>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [inputText, setInputText] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    const qSub = query(collection(db, 'submissions'), orderBy('timestamp', 'desc'));
    const unsubSub = onSnapshot(qSub, (snapshot) => {
      setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    });

    const qPat = query(collection(db, 'patterns'), orderBy('timestamp', 'desc'));
    const unsubPat = onSnapshot(qPat, (snapshot) => {
      setPatterns(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CheatingPattern)));
    });

    const qRes = query(collection(db, 'analysisResults'));
    const unsubRes = onSnapshot(qRes, (snapshot) => {
      const results: Record<string, AnalysisResult> = {};
      snapshot.docs.forEach(d => {
        const data = d.data() as AnalysisResult;
        results[data.submissionId] = { id: d.id, ...data };
      });
      setAnalysisResults(results);
    });

    return () => {
      unsubSub();
      unsubPat();
      unsubRes();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = () => signOut(auth);

  const performAnalysis = async (text: string, subId: string) => {
    setIsAnalyzing(true);
    try {
      // 1. ดึงข้อมูล Embedding
      const embedding = await getEmbedding(text);

      // 2. RAG: คำนวณความคล้ายคลึงเพื่อดึงเคสในอดีตมาเป็น Context
      const similarities = patterns.map(p => ({
        id: p.id,
        text: p.text,
        label: p.label,
        similarity: cosineSimilarity(embedding, p.embedding)
      })).sort((a, b) => b.similarity - a.similarity).slice(0, 3);

      const context = similarities.map(s => 
        `กรณี: ${s.text}\nประเภท: ${s.label === 'cheating' ? 'ทุจริต' : 'ปกติ'}\nความคล้ายคลึง: ${s.similarity.toFixed(4)}`
      ).join('\n\n');

      // 3. วิเคราะห์ด้วย Gemini
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", // ใช้โมเดลตามคู่มือ
        contents: `
          คุณคือผู้เชี่ยวชาญด้านความโปร่งใสทางวิชาการ
          วิเคราะห์ข้อความต่อไปนี้เพื่อหาโอกาสในการทุจริตหรือการใช้ AI สร้างข้อความ
          
          ข้อความที่ส่งมา:
          ${text}
          
          ข้อมูลอ้างอิงจากอดีต (RAG CONTEXT):
          ${context || 'ยังไม่มีข้อมูลในอดีต'}
          
          ประเมินตามเกณฑ์ดังนี้:
          1. ความคล้ายคลึงกับรูปแบบการทุจริตที่เคยพบ
          2. ความสม่ำเสมอของโทนและสไตล์การเขียน
          3. ความซับซ้อนเมื่อเทียบกับระดับนักเรียนทั่วไป
          
          **สำคัญ**: ให้ตอบเป็นภาษาไทยที่เข้าใจง่าย ตรงไปตรงมา ไม่ใช้ศัพท์เทคนิคที่ยากเกินไป
          ส่งผลการวิเคราะห์ในรูปแบบ JSON ตาม Schema ที่กำหนด
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cheatingScore: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              similarCaseIds: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["cheatingScore", "reasoning", "similarCaseIds"]
          }
        }
      });

      // 4. แปลงผลลัพธ์เป็น Object
      const result = JSON.parse(response.text || "{}"); 

      // 5. บันทึกลง Firestore
      await addDoc(collection(db, 'analysisResults'), {
        submissionId: subId,
        cheatingScore: result.cheatingScore || 0,
        reasoning: result.reasoning || "ไม่สามารถวิเคราะห์เหตุผลได้",
        similarCases: result.similarCaseIds || [],
        timestamp: new Date().toISOString()
      });

      await updateDoc(doc(db, 'submissions', subId), {
        status: 'analyzed'
      });

    } catch (error) {
      console.error("Analysis failed:", error);
      alert("เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูลโดย AI");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("1. ปุ่มถูกกดแล้ว! ข้อความคือ:", inputText);

    if (!inputText) {
      alert("ใส่ข้อความก่อนกดตรวจสอบนะครับ!");
      return;
    }

    try {
      console.log("2. กำลังพยายามบันทึกลงฐานข้อมูล Firebase...");
      const subRef = await addDoc(collection(db, 'submissions'), {
        text: inputText,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      console.log("3. บันทึกสำเร็จ! ได้ ID:", subRef.id);

      console.log("4. กำลังส่งให้ Gemini วิเคราะห์...");
      await performAnalysis(inputText, subRef.id);
      
      setInputText('');
      setActiveTab('history');
    } catch (error: any) {
      console.error("🚨 ระบบพังที่ขั้นตอนนี้:", error);
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
  };

  const handleCorrect = async (sub: Submission, label: 'cheating' | 'not_cheating') => {
    try {
      const embedding = await getEmbedding(sub.text);
      
      await addDoc(collection(db, 'patterns'), {
        text: sub.text,
        description: `การแก้ไขโดยผู้ดูแลระบบ`,
        label,
        embedding,
        timestamp: new Date().toISOString()
      });

      await updateDoc(doc(db, 'submissions', sub.id), {
        status: 'corrected'
      });

    } catch (error) {
      console.error("Correction failed:", error);
    }
  };

  if (!isAuthReady) return <div className="h-screen flex items-center justify-center bg-zinc-50 text-zinc-400 font-mono">กำลังเชื่อมต่อฐานข้อมูล...</div>;

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 text-zinc-900 p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="flex justify-center">
            <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-xl">
              <Shield className="w-16 h-16 text-blue-600" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tighter font-serif">พลิกเกมกลโกง</h1>
            <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">ระบบตรวจสอบความโปร่งใสทางวิชาการ</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-zinc-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors shadow-lg"
          >
            <LogIn className="w-5 h-5" />
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-blue-500/30">
      <nav className="fixed left-0 top-0 h-full w-20 bg-white border-r border-zinc-200 flex flex-col items-center py-8 gap-8 z-50 shadow-sm">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>
        
        <div className="flex-1 flex flex-col gap-4">
          <NavButton active={activeTab === 'submit'} onClick={() => setActiveTab('submit')} icon={<Send className="w-6 h-6" />} label="หน้าทดสอบ" />
          <NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-6 h-6" />} label="ประวัติ" />
          <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings className="w-6 h-6" />} label="จัดการ" />
        </div>

        <button onClick={handleLogout} className="p-3 text-zinc-400 hover:text-red-500 transition-colors">
          <LogOut className="w-6 h-6" />
        </button>
      </nav>

      <main className="pl-20 min-h-screen">
        <header className="h-20 border-b border-zinc-200 flex items-center justify-between px-8 sticky top-0 bg-white/80 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-serif font-bold text-zinc-800">
              {activeTab === 'submit' && 'ส่งข้อมูลตรวจสอบ'}
              {activeTab === 'history' && 'ประวัติการวิเคราะห์'}
              {activeTab === 'admin' && 'หน่วยความจำระบบ'}
            </h2>
            <div className="h-1 w-1 bg-zinc-300 rounded-full" />
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
              {user.email}
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-zinc-500">ระบบทำงานปกติ</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <Database className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-500">{patterns.length} รูปแบบ</span>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'submit' && (
              <motion.div 
                key="submit"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
              >
                <div className="lg:col-span-2 space-y-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4">
                      <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">ข้อความหรือเนื้อหาที่ต้องการตรวจสอบ</label>
                      <textarea 
                        placeholder="วางข้อความที่นี่..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="w-full h-96 bg-white border border-zinc-200 rounded-2xl p-6 font-sans text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none shadow-sm"
                        required
                      />
                    </div>

                    <button 
                      disabled={isAnalyzing}
                      className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          กำลังวิเคราะห์ด้วย AI...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-5 h-5" />
                          เริ่มการตรวจสอบ
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="space-y-6">
                  <div className="p-6 bg-white border border-zinc-200 rounded-2xl space-y-4 shadow-sm">
                    <h3 className="font-serif font-bold text-lg">สถานะระบบ</h3>
                    <div className="space-y-3">
                      <StatusItem icon={<Search className="w-4 h-4" />} label="การเตรียมข้อมูล" status="พร้อม" />
                      <StatusItem icon={<Database className="w-4 h-4" />} label="RAG Controller" status="ทำงาน" />
                      <StatusItem icon={<BrainCircuit className="w-4 h-4" />} label="Reasoning Engine" status="Gemini 3 Preview" />
                    </div>
                  </div>

                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl space-y-4">
                    <h3 className="font-serif font-bold text-lg text-blue-700">RAG Memory</h3>
                    <p className="text-sm text-zinc-600 leading-relaxed">
                      ระบบจะเปรียบเทียบข้อมูลใหม่กับรูปแบบในอดีต {patterns.length} รายการ เพื่อระบุวิธีการทุจริตที่ซับซ้อนขึ้น
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 gap-4">
                  {submissions.map((sub) => (
                    <SubmissionCard 
                      key={sub.id} 
                      submission={sub} 
                      result={analysisResults[sub.id]} 
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'admin' && (
              <motion.div 
                key="admin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-bold">วงจรการเรียนรู้ (Learning Loop)</h3>
                  <div className="px-4 py-2 bg-white border border-zinc-200 rounded-full text-xs font-mono text-zinc-500 shadow-sm">
                    รอการตรวจสอบ: {submissions.filter(s => s.status === 'analyzed').length}
                  </div>
                </div>

                <div className="space-y-4">
                  {submissions.filter(s => s.status === 'analyzed').map((sub) => (
                    <div key={sub.id} className="p-6 bg-white border border-zinc-200 rounded-2xl flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-zinc-400">{new Date(sub.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-zinc-600 line-clamp-2 italic">"{sub.text}"</p>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded",
                            analysisResults[sub.id]?.cheatingScore > 50 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            AI Score: {analysisResults[sub.id]?.cheatingScore}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 shrink-0">
                        <button 
                          onClick={() => handleCorrect(sub, 'cheating')}
                          className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          ยืนยันว่าทุจริต
                        </button>
                        <button 
                          onClick={() => handleCorrect(sub, 'not_cheating')}
                          className="px-4 py-2 bg-green-50 text-green-600 border border-green-100 rounded-xl text-xs font-bold hover:bg-green-600 hover:text-white transition-all flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          ยืนยันว่าปกติ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">การอัปเดตความจำล่าสุด</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {patterns.slice(0, 6).map(p => (
                      <div key={p.id} className="p-4 bg-white border border-zinc-100 rounded-2xl space-y-2 shadow-sm">
                        <div className="flex justify-between items-start">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                            p.label === 'cheating' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                          )}>
                            {p.label === 'cheating' ? 'ทุจริต' : 'ปกติ'}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">{new Date(p.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-3 italic">"{p.text}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-all group relative",
        active ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
      )}
    >
      {icon}
      <span className="absolute left-full ml-4 px-2 py-1 bg-zinc-800 text-white text-[10px] font-mono rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}

function StatusItem({ icon, label, status }: { icon: React.ReactNode, label: string, status: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-mono">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-blue-600 font-bold">{status}</span>
    </div>
  );
}

function SubmissionCard({ submission, result }: { submission: Submission, result?: AnalysisResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden transition-all hover:border-blue-200 shadow-sm">
      <div 
        className="p-6 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-6">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center",
            submission.status === 'pending' ? "bg-zinc-100 text-zinc-400" :
            result && result.cheatingScore > 50 ? "bg-red-50 text-red-500" : "bg-green-50 text-green-500"
          )}>
            {submission.status === 'pending' ? <RefreshCw className="w-6 h-6 animate-spin" /> : 
             result && result.cheatingScore > 50 ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h4 className="font-bold text-zinc-800 line-clamp-1 max-w-[200px]">{submission.text.slice(0, 30)}...</h4>
              <div className="h-1 w-1 bg-zinc-200 rounded-full" />
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                {submission.status === 'pending' ? 'กำลังรอ' : submission.status === 'analyzed' ? 'วิเคราะห์แล้ว' : 'แก้ไขแล้ว'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono">{new Date(submission.timestamp).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {result && (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">ความเป็นมนุษย์</div>
                <div className="text-lg font-bold text-green-600">{100 - result.cheatingScore}%</div>
              </div>
              <div className="w-px h-8 bg-zinc-100" />
              <div className="text-right">
                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">AI / ทุจริต</div>
                <div className="text-lg font-bold text-red-500">{result.cheatingScore}%</div>
              </div>
            </div>
          )}
          <ChevronRight className={cn("w-5 h-5 text-zinc-300 transition-transform", isExpanded && "rotate-90")} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-zinc-100 bg-zinc-50/50"
          >
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h5 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">เนื้อหาที่ส่งตรวจสอบ</h5>
                <div className="p-6 bg-white border border-zinc-100 rounded-2xl text-sm text-zinc-600 leading-relaxed font-sans shadow-inner">
                  {submission.text}
                </div>
              </div>

              <div className="space-y-6">
                {result ? (
                  <>
                    <div className="space-y-4">
                      <h5 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">เหตุผลจากการวิเคราะห์</h5>
                      <div className="prose prose-zinc prose-sm max-w-none text-zinc-600">
                        <Markdown>{result.reasoning}</Markdown>
                      </div>
                    </div>
                    
                    {result.similarCases && result.similarCases.length > 0 && (
                      <div className="space-y-4">
                        <h5 className="text-xs font-mono text-zinc-400 uppercase tracking-widest">พบรูปแบบที่คล้ายคลึงกัน</h5>
                        <div className="flex flex-wrap gap-2">
                          {result.similarCases.map(id => (
                            <div key={id} className="px-3 py-1 bg-white border border-zinc-200 rounded-full text-[10px] font-mono text-zinc-500 shadow-sm">
                              กรณี_{id.slice(0, 8)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
                    <RefreshCw className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-mono uppercase tracking-widest">กำลังวิเคราะห์...</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}