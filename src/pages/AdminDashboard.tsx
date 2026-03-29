import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  History, 
  Settings, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  LogOut,
  Database,
  BrainCircuit,
  ChevronRight,
  MessageSquare,
  User as UserIcon,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc
} from 'firebase/firestore';
import { signOut, User } from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { db, auth } from '../firebase';
import { cn } from '../lib/utils';

interface Submission {
  id: string;
  text: string;
  status: 'pending' | 'analyzed' | 'corrected';
  timestamp: string;
  isAnonymous?: boolean;
  disputed?: boolean;
  disputeTimestamp?: any;
  disputeType?: 'claim_human' | 'claim_ai';
  disputeReason?: string;
}

interface AnalysisResult {
  id: string;
  submissionId: string;
  cheatingScore: number;
  confidenceScore?: number;
  reasoning: string;
  analysisDetails?: {
    grammar: string;
    depth: string;
    wordUsage: string;
  };
  heatmap?: { text: string; score: number }[];
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

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function getEmbedding(text: string) {
  const result = await genAI.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: [text],
  });
  return result.embeddings[0].values;
}

const AdminDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'history' | 'admin'>('admin');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [patterns, setPatterns] = useState<CheatingPattern[]>([]);
  const [analysisResults, setAnalysisResults] = useState<Record<string, AnalysisResult>>({});

  useEffect(() => {
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
  }, []);

  const handleLogout = () => signOut(auth);

  const handleCorrect = async (sub: Submission, label: 'cheating' | 'not_cheating') => {
    try {
      const embedding = await getEmbedding(sub.text);
      
      await addDoc(collection(db, 'patterns'), {
        text: sub.text,
        description: `การแก้ไขโดยผู้ดูแลระบบ (${user.email})`,
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-zinc-900 font-sans selection:bg-blue-500/30 relative overflow-hidden">
      {/* Grand Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-indigo-100/10 rounded-full blur-[100px]" />
      </div>

      <nav className="fixed left-0 top-0 h-full w-24 bg-white/60 backdrop-blur-xl border-r border-zinc-200/50 flex flex-col items-center py-10 gap-10 z-50 shadow-2xl shadow-zinc-200/50">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/40 border border-blue-400/30">
          <Shield className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex-1 flex flex-col gap-6">
          <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Settings className="w-6 h-6" />} label="จัดการ" />
          <NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-6 h-6" />} label="ประวัติ" />
        </div>

        <button onClick={handleLogout} className="p-4 text-zinc-400 hover:text-red-500 transition-all hover:bg-red-50 rounded-2xl group">
          <LogOut className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
        </button>
      </nav>

      <main className="pl-24 min-h-screen relative z-10">
        <header className="h-24 border-b border-zinc-200/50 flex items-center justify-between px-12 sticky top-0 bg-white/40 backdrop-blur-xl z-40">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-serif font-black text-zinc-900 tracking-tight">
              {activeTab === 'history' && 'ประวัติการวิเคราะห์'}
              {activeTab === 'admin' && 'หน่วยความจำระบบ'}
            </h2>
            <div className="h-1.5 w-1.5 bg-zinc-300 rounded-full" />
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-[0.2em]">
                ADMINISTRATOR
              </span>
              <span className="text-xs font-medium text-zinc-500">
                {user.email}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 px-4 py-2 bg-white/50 border border-zinc-200/50 rounded-full shadow-sm">
              <Database className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-bold text-zinc-600">{patterns.length} รูปแบบความจำ</span>
            </div>
          </div>
        </header>

        <div className="p-12 max-w-6xl mx-auto space-y-12">
          <AnimatePresence mode="wait">
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

                <div className="space-y-6">
                  {submissions
                    .filter(s => s.status === 'analyzed')
                    .sort((a, b) => (b.disputed ? 1 : 0) - (a.disputed ? 1 : 0))
                    .map((sub) => (
                    <div 
                      key={sub.id} 
                      className={cn(
                        "p-8 bg-white border rounded-[2rem] flex flex-col md:flex-row gap-8 items-start md:items-center transition-all shadow-sm",
                        sub.disputed ? "border-orange-200 bg-orange-50/30 ring-1 ring-orange-100" : "border-zinc-200"
                      )}
                    >
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-mono font-bold text-zinc-400">{new Date(sub.timestamp).toLocaleString()}</span>
                          {sub.isAnonymous && (
                            <span className="text-[10px] font-mono font-bold bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">ANONYMOUS</span>
                          )}
                          {sub.disputed && (
                            <motion.span 
                              animate={{ scale: [1, 1.05, 1] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="text-[10px] font-mono font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg shadow-orange-500/20"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              โต้แย้งด่วน
                            </motion.span>
                          )}
                        </div>
                        <p className="text-base text-zinc-700 line-clamp-2 italic font-serif leading-relaxed">"{sub.text}"</p>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-xs font-black px-3 py-1 rounded-lg shadow-sm",
                            analysisResults[sub.id]?.cheatingScore > 50 ? "bg-red-500 text-white" : "bg-green-500 text-white"
                          )}>
                            AI Score: {analysisResults[sub.id]?.cheatingScore}%
                          </span>
                          {sub.disputed && (
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-bold text-orange-600">
                                ผู้ใช้ยืนยันว่าเป็น: {sub.disputeType === 'claim_human' ? 'มนุษย์' : 'AI'}
                              </span>
                              {sub.disputeReason && (
                                <span className="text-[10px] text-orange-500 italic">
                                  เหตุผล: {sub.disputeReason}
                                </span>
                              )}
                            </div>
                          )}
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
};

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
          
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h4 className="font-black text-zinc-900 line-clamp-1 max-w-[200px] font-serif">{submission.text.slice(0, 30)}...</h4>
              {submission.disputed && (
                <span className="text-[10px] font-mono font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md shadow-orange-500/20">
                  โต้แย้ง
                </span>
              )}
              <div className="h-1 w-1 bg-zinc-200 rounded-full" />
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
                {submission.status === 'pending' ? 'กำลังรอ' : submission.status === 'analyzed' ? 'วิเคราะห์แล้ว' : 'แก้ไขแล้ว'}
              </span>
            </div>
            <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">{new Date(submission.timestamp).toLocaleString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {result && (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">ความมั่นใจ</div>
                <div className={cn(
                  "text-lg font-bold",
                  (result.confidenceScore || 0) < 60 ? "text-amber-500" : "text-blue-600"
                )}>
                  {result.confidenceScore || 0}%
                </div>
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

                    {result.analysisDetails && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-zinc-100">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">ไวยากรณ์</span>
                          <p className="text-[10px] text-zinc-600 line-clamp-2">{result.analysisDetails.grammar}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">ความลึกซึ้ง</span>
                          <p className="text-[10px] text-zinc-600 line-clamp-2">{result.analysisDetails.depth}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">การใช้คำ</span>
                          <p className="text-[10px] text-zinc-600 line-clamp-2">{result.analysisDetails.wordUsage}</p>
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

export default AdminDashboard;
