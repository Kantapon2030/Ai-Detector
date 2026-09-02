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
  Trash2,
  Activity,
  Wind
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { signOut, User } from 'firebase/auth';
import Markdown from 'react-markdown';
import { db, auth } from '../firebase';
import { cn } from '../lib/utils';
import { createTermFrequencyVector } from '../lib/vectorEngine';

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
  modelUsed?: string;
}

interface AnalysisResult {
  id: string;
  submissionId: string;
  cheatingScore: number;
  confidenceScore?: number;
  verdict?: string;
  reasoning: string;
  analysisDetails?: {
    grammar: string;
    depth: string;
    wordUsage: string;
  };
  heatmap?: { text: string; score: number }[];
  modelUsed?: string;
  timestamp: string;
}

interface CheatingPattern {
  id: string;
  text: string;
  description: string;
  label: 'cheating' | 'not_cheating';
  tfVector?: Record<string, number>;
  timestamp: string;
}

interface ApiHealthInfo {
  status: 'healthy' | 'unhealthy' | 'loading';
  provider?: string;
  model?: string;
  latency?: number;
  error?: string;
  details?: string;
  timestamp?: string;
}

const AdminDashboard: React.FC<{ user: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'admin' | 'history' | 'api-status'>('admin');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [patterns, setPatterns] = useState<CheatingPattern[]>([]);
  const [analysisResults, setAnalysisResults] = useState<Record<string, AnalysisResult>>({});
  const [apiHealth, setApiHealth] = useState<ApiHealthInfo>({ status: 'loading' });
  const [isRefreshingApi, setIsRefreshingApi] = useState(false);

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
        results[data.submissionId] = { ...data };
      });
      setAnalysisResults(results);
    });

    return () => {
      unsubSub();
      unsubPat();
      unsubRes();
    };
  }, []);

  const checkApiHealth = async () => {
    setIsRefreshingApi(true);
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (response.ok && data.status === 'healthy') {
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
          provider: 'OpenTyphoon AI',
          model: 'typhoon-v2.5-30b-a3b-instruct',
          error: data.error || 'Connection error',
          details: data.details || data.message,
          timestamp: data.timestamp
        });
      }
    } catch (error: any) {
      setApiHealth({
        status: 'unhealthy',
        provider: 'OpenTyphoon AI',
        error: 'Network Error',
        details: error.message
      });
    }
    setIsRefreshingApi(false);
  };

  useEffect(() => {
    checkApiHealth();
    const interval = setInterval(checkApiHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => signOut(auth);

  const handleCorrect = async (sub: Submission, label: 'cheating' | 'not_cheating') => {
    try {
      const tfVector = createTermFrequencyVector(sub.text);

      await addDoc(collection(db, 'patterns'), {
        text: sub.text,
        description: `ปรับปรุงคำตัดสินโดย ${user.email}`,
        label,
        tfVector,
        timestamp: new Date().toISOString()
      });

      await updateDoc(doc(db, 'submissions', sub.id), {
        status: 'corrected',
        correctedLabel: label,
        correctedBy: user.email
      });

    } catch (error) {
      console.error("Correction failed:", error);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?')) return;
    try {
      await deleteDoc(doc(db, 'submissions', id));
      const q = query(collection(db, 'analysisResults'), where('submissionId', '==', id));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'analysisResults', d.id))));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleDeletePattern = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบ Pattern นี้?')) return;
    try {
      await deleteDoc(doc(db, 'patterns', id));
    } catch (error) {
      console.error("Delete pattern failed:", error);
    }
  };

  const handleDeleteAllSubmissions = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลทั้งหมด?')) return;
    try {
      const q = query(collection(db, 'submissions'));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'submissions', d.id))));

      const resQ = query(collection(db, 'analysisResults'));
      const resSnap = await getDocs(resQ);
      await Promise.all(resSnap.docs.map(d => deleteDoc(doc(db, 'analysisResults', d.id))));
    } catch (error) {
      console.error("Delete all failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-zinc-900 font-sans selection:bg-blue-500/30 relative overflow-hidden">
      <nav className="fixed left-0 top-0 h-full w-20 md:w-24 bg-white/70 backdrop-blur-xl border-r border-zinc-200/50 flex flex-col items-center py-8 gap-8 z-50 shadow-xl">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 border border-blue-400/30">
          <Shield className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex-1 flex flex-col gap-5">
          <NavButton 
            active={activeTab === 'admin'} 
            onClick={() => setActiveTab('admin')} 
            icon={<Settings className="w-5 h-5" />} 
            label="จัดการผล" 
          />
          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={<History className="w-5 h-5" />} 
            label="ประวัติ" 
          />
          <NavButton 
            active={activeTab === 'api-status'} 
            onClick={() => setActiveTab('api-status')} 
            icon={<Activity className="w-5 h-5" />} 
            label="สถานะ API" 
          />
        </div>

        <button 
          onClick={handleLogout} 
          className="p-3.5 text-zinc-400 hover:text-red-500 transition-all hover:bg-red-50 rounded-2xl"
          title="ออกจากระบบ"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </nav>

      <main className="pl-20 md:pl-24 min-h-screen relative z-10">
        <header className="h-20 border-b border-zinc-200/50 flex items-center justify-between px-6 md:px-12 sticky top-0 bg-white/60 backdrop-blur-xl z-40">
          <div className="flex items-center gap-4">
            <h2 className="text-xl md:text-2xl font-serif font-black text-zinc-900 tracking-tight">
              {activeTab === 'admin' && 'การจัดการผลและ Dispute (Learning Loop)'}
              {activeTab === 'history' && 'ประวัติการส่งข้อมูลวิเคราะห์'}
              {activeTab === 'api-status' && 'สถานะ Typhoon AI API'}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/70 border border-zinc-200 rounded-full shadow-sm text-xs font-bold text-zinc-600">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              <span>{patterns.length} RAG Patterns</span>
            </div>
            <a href="/" className="text-xs font-bold text-blue-600 hover:underline">
              กลับหน้าบ้าน
            </a>
          </div>
        </header>

        <div className="p-6 md:p-12 max-w-6xl mx-auto space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'admin' && (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-serif font-bold text-zinc-900">รายการคำขอตรวจสอบและข้อโต้แย้ง</h3>
                    <p className="text-xs text-zinc-500">คลิก 'มนุษย์' หรือ 'AI' เพื่อยืนยันผลและฝึกระบบ Learning Loop</p>
                  </div>
                  <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
                    รอการตรวจสอบ: {submissions.filter(s => s.status === 'analyzed').length}
                  </span>
                </div>

                <div className="space-y-4">
                  {submissions
                    .filter(s => s.status === 'analyzed')
                    .sort((a, b) => (b.disputed ? 1 : 0) - (a.disputed ? 1 : 0))
                    .map((sub) => {
                      const res = analysisResults[sub.id];
                      return (
                        <div 
                          key={sub.id} 
                          className={cn(
                            "p-6 bg-white border rounded-2xl shadow-sm space-y-4 transition-all",
                            sub.disputed ? "border-amber-300 bg-amber-50/20" : "border-zinc-200"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-zinc-400">{new Date(sub.timestamp).toLocaleString('th-TH')}</span>
                              {sub.disputed && (
                                <span className="text-[10px] font-bold bg-amber-500 text-white px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  ผู้ใช้โต้แย้งผล ({sub.disputeType === 'claim_human' ? 'อ้างว่าเป็นมนุษย์' : 'อ้างว่าเป็น AI'})
                                </span>
                              )}
                            </div>
                            {res && (
                              <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg text-white", res.cheatingScore >= 50 ? "bg-red-500" : "bg-emerald-500")}>
                                AI Score: {res.cheatingScore}%
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-zinc-800 bg-zinc-50 p-4 rounded-xl border border-zinc-100 font-serif leading-relaxed line-clamp-3">
                            "{sub.text}"
                          </p>

                          {sub.disputed && sub.disputeReason && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                              <strong>เหตุผลการโต้แย้ง:</strong> {sub.disputeReason}
                            </div>
                          )}

                          {res?.reasoning && (
                            <div className="text-xs text-zinc-600 bg-zinc-50/70 p-3 rounded-xl">
                              <strong>เหตุผลจาก Typhoon AI:</strong> {res.reasoning}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCorrect(sub, 'not_cheating')}
                                className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                ยืนยันเป็น "มนุษย์"
                              </button>
                              <button
                                onClick={() => handleCorrect(sub, 'cheating')}
                                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 flex items-center gap-1.5 shadow-sm"
                              >
                                <AlertTriangle className="w-4 h-4" />
                                ยืนยันเป็น "AI"
                              </button>
                            </div>
                            <button
                              onClick={() => handleDeleteSubmission(sub.id)}
                              className="p-2 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                              title="ลบรายการนี้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  {submissions.filter(s => s.status === 'analyzed').length === 0 && (
                    <div className="p-12 text-center bg-white border border-zinc-200 rounded-3xl text-zinc-400 text-sm">
                      ไม่มีรายการที่รอการตรวจสอบในขณะนี้
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-serif font-bold text-zinc-900">ประวัติการวิเคราะห์ทั้งหมด ({submissions.length})</h3>
                  <button
                    onClick={handleDeleteAllSubmissions}
                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    ลบประวัติทั้งหมด
                  </button>
                </div>

                <div className="space-y-3">
                  {submissions.map((sub) => {
                    const res = analysisResults[sub.id];
                    return (
                      <div key={sub.id} className="p-4 bg-white border border-zinc-200 rounded-2xl flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-800 truncate font-serif">"{sub.text}"</p>
                          <span className="text-[10px] font-mono text-zinc-400">{new Date(sub.timestamp).toLocaleString('th-TH')}</span>
                        </div>
                        {res && (
                          <span className={cn("text-xs font-bold px-2.5 py-1 rounded-lg text-white shrink-0", res.cheatingScore >= 50 ? "bg-red-500" : "bg-emerald-500")}>
                            {res.cheatingScore}% AI
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeTab === 'api-status' && (
              <motion.div key="api-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wind className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-serif font-bold text-zinc-900">สถานะ OpenTyphoon AI Service</h3>
                  </div>
                  <button
                    onClick={checkApiHealth}
                    disabled={isRefreshingApi}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", isRefreshingApi && "animate-spin")} />
                    ตรวจสอบสถานะสด
                  </button>
                </div>

                <div className="p-6 bg-white border border-zinc-200 rounded-3xl space-y-6 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <span className="text-xs text-zinc-500 block mb-1">สถานะ API</span>
                      <span className={cn("text-base font-bold", apiHealth.status === 'healthy' ? "text-emerald-600" : "text-red-600")}>
                        {apiHealth.status === 'healthy' ? '✓ พร้อมใช้งาน (Healthy)' : '✗ มีปัญหา (Unhealthy)'}
                      </span>
                    </div>
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <span className="text-xs text-zinc-500 block mb-1">โมเดลที่ใช้งาน</span>
                      <span className="text-sm font-mono font-bold text-blue-600">{apiHealth.model || 'typhoon-v2.5-30b-a3b-instruct'}</span>
                    </div>
                    <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                      <span className="text-xs text-zinc-500 block mb-1">ความเร็วการตอบสนอง</span>
                      <span className="text-base font-mono font-bold text-zinc-800">{apiHealth.latency ? `${apiHealth.latency} ms` : '-'}</span>
                    </div>
                  </div>

                  {apiHealth.error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 space-y-1">
                      <strong>ข้อผิดพลาด:</strong> {apiHealth.error}
                      <p className="font-mono text-[11px] text-red-600">{apiHealth.details}</p>
                    </div>
                  )}

                  <div className="pt-4 border-t border-zinc-100 space-y-3">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">ฐานข้อมูล RAG Patterns ({patterns.length} รูปแบบ)</h4>
                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                      {patterns.map((p) => (
                        <div key={p.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex items-center justify-between text-xs">
                          <div className="flex-1 min-w-0 pr-4">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold mr-2", p.label === 'cheating' ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>
                              {p.label === 'cheating' ? 'AI' : 'มนุษย์'}
                            </span>
                            <span className="text-zinc-700 truncate font-serif">"{p.text}"</span>
                          </div>
                          <button
                            onClick={() => handleDeletePattern(p.id)}
                            className="p-1 text-zinc-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
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

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({
  active,
  onClick,
  icon,
  label
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all w-16",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" 
        : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
    )}
  >
    {icon}
    <span className="text-[9px] font-bold tracking-tight">{label}</span>
  </button>
);

export default AdminDashboard;
