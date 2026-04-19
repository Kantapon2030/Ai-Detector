import React, { useState } from 'react';
import { 
  Shield, 
  BrainCircuit, 
  RefreshCw, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  File, 
  X,
  AlertTriangle,
  CheckCircle2,
  Zap,
  History,
  MessageSquare,
  User,
  Bot,
  Settings
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
import { GoogleGenAI, Type } from "@google/genai";
import mammoth from 'mammoth';
import { db, auth } from '../firebase';
import GaugeMeter from '../components/GaugeMeter';
import Logo from '../components/Logo';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import FloatingParticles from '../components/FloatingParticles';
import LoadingScreen from '../components/LoadingScreen';
import { classifyInput, detectSpecialization, selectModel, getNextModel, ModelRouting, HealthStatus } from '../lib/smartRouter';

interface HeatmapSegment {
  text: string;
  score: number;
}

interface AnalysisResult {
  score: number;
  reasoning: string;
  heatmap: HeatmapSegment[];
  confidenceScore: number;
  analysisDetails: {
    grammar: string;
    depth: string;
    wordUsage: string;
  };
  modelUsed?: string;
  isCorrected?: boolean;
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Cosine similarity for RAG
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const PublicHome: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [disputeStatus, setDisputeStatus] = useState<'none' | 'submitting' | 'submitted'>('none');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeType, setDisputeType] = useState<'claim_human' | 'claim_ai'>('claim_human');
  const [isCached, setIsCached] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [selectedModel, setSelectedModel] = useState<'auto' | 'gemini-3-flash-preview' | 'gemini-3.1-flash-lite-preview' | 'gemini-3.1-flash-live-preview' | 'thaillm-playground'>('auto');
  const [actualModelUsed, setActualModelUsed] = useState<string>('');
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [apiHealth, setApiHealth] = useState<HealthStatus | null>(null);
  const [isLoadingScreen, setIsLoadingScreen] = useState(true);

  // Client-side cache
  const analysisCache = React.useRef<Map<string, AnalysisResult>>(new Map());

  const hashText = async (text: string) => {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Auth listener
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // API Health check on mount
  React.useEffect(() => {
    const checkApiHealth = async () => {
      setApiHealth(prev => prev ? prev : { status: 'loading', totalModels: 0, workingModels: 0, models: {} });
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setApiHealth(data);
        // Hide loading screen after health check completes
        setTimeout(() => setIsLoadingScreen(false), 500);
      } catch (error) {
        setApiHealth({ status: 'unhealthy', totalModels: 0, workingModels: 0, models: {} });
        // Hide loading screen even if health check fails
        setTimeout(() => setIsLoadingScreen(false), 500);
      }
    };
    checkApiHealth();
    // Check every 30 seconds
    const interval = setInterval(checkApiHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time history listener
  React.useEffect(() => {
    const q = query(
      collection(db, 'submissions'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyItems = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => item.status === 'analyzed')
        .slice(0, 10);
      setHistory(historyItems);
    }, (err) => {
      console.error("Failed to fetch history:", err);
    });
    
    return () => unsubscribe();
  }, []);

  const isAdmin = user?.email === "tawna20081@gmail.com";

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError(`เกิดข้อผิดพลาด: โดเมนนี้ยังไม่ได้รับอนุญาตให้ใช้งาน Firebase Auth\n\nกรุณาเพิ่มโดเมนนี้ใน Firebase Console:\n${window.location.hostname}`);
      } else if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup - this is normal, don't show error
        console.log("Login popup closed by user");
      } else if (err.code === 'auth/cancelled') {
        // User cancelled - also normal
        console.log("Login cancelled by user");
      } else {
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

  const deleteHistoryItem = async (id: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลนี้?')) return;
    try {
      if (isAdmin) {
        // Delete submission and its analysis results
        await deleteDoc(doc(db, 'submissions', id));
        const q = query(collection(db, 'analysisResults'), where('submissionId', '==', id));
        const snap = await getDocs(q);
        const delResults = snap.docs.map(d => deleteDoc(doc(db, 'analysisResults', d.id)));
        await Promise.all(delResults);
      }
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete history item:", err);
      if (err instanceof Error && err.message.includes('permission-denied')) {
        setError('คุณไม่มีสิทธิ์ลบข้อมูลนี้ (เฉพาะแอดมินเท่านั้น)');
      }
    }
  };

  const clearAllHistory = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติทั้งหมด?')) return;
    if (!isAdmin) {
      // For non-admins, just clear local history state
      setHistory([]);
      analysisCache.current.clear();
      return;
    }

    try {
      const q = query(collection(db, 'submissions'), where('status', '==', 'analyzed'));
      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.flatMap(d => [
        deleteDoc(doc(db, 'submissions', d.id)),
        // We'd need to fetch analysisResults for each, but for performance we can just clear submissions
        // and let the rules handle the rest or do a batch.
        // For now, let's just delete the submissions.
      ]);
      
      await Promise.all(deletePromises);
      
      // Also try to clear analysisResults for these submissions
      const subIds = querySnapshot.docs.map(d => d.id);
      if (subIds.length > 0) {
        const resQ = query(collection(db, 'analysisResults'), where('submissionId', 'in', subIds.slice(0, 10))); // Firestore 'in' limit is 10
        const resSnap = await getDocs(resQ);
        await Promise.all(resSnap.docs.map(d => deleteDoc(doc(db, 'analysisResults', d.id))));
      }

      setHistory([]);
      analysisCache.current.clear();
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const clearForm = () => {
    setInputText('');
    setFile(null);
    setResult(null);
    setStreamingReasoning('');
    setError(null);
    setSubmissionId(null);
    setIsCached(false);
    setDisputeStatus('none');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/pdf',
        'image/png'
      ];
      if (allowedTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('รองรับเฉพาะไฟล์ .docx, .pdf, และ .png เท่านั้น');
      }
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const performAnalysis = async () => {
    if (!inputText && !file) return;
    
    // 0. Smart Cache Invalidation: Always clear previous result and cache
    setResult(null);
    setStreamingReasoning('');
    setError(null);
    setIsCached(false);
    setDisputeStatus('none');
    analysisCache.current.clear(); // Force fresh check from Firestore/API

    setIsAnalyzing(true);

    try {
      const cacheKey = inputText.trim();
      const textHash = cacheKey ? await hashText(cacheKey) : null;
      let promptText = inputText;
      let parts: any[] = [];

      // 1. Server-side Caching Check (Priority Logic)
      if (textHash && !file) {
        // Check for EXACT match in submissions
        const q = query(
          collection(db, 'submissions'), 
          where('textHash', '==', textHash),
          limit(10) // Get recent ones to check status
        );
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          // Sort in memory to avoid requiring a composite index
          const docs = [...querySnapshot.docs].sort((a, b) => {
            const timeA = new Date(a.data().timestamp).getTime();
            const timeB = new Date(b.data().timestamp).getTime();
            return timeB - timeA;
          });
          
          // PRIORITY 1: Check for 'corrected' status (Admin confirmed)
          const correctedDoc = docs.find(d => d.data().status === 'corrected');
          if (correctedDoc) {
            const subData = correctedDoc.data();
            const subId = correctedDoc.id;
            
            // For corrected, we might not have a full analysisResult doc if it was a manual override
            // But we should check patterns or the result doc
            const resQ = query(collection(db, 'analysisResults'), where('submissionId', '==', subId), limit(1));
            const resSnapshot = await getDocs(resQ);
            
            if (resSnapshot.empty) {
              // Fallback if result doc is missing but submission is corrected
              const fallbackResult: AnalysisResult = {
                score: subData.cheatingScore || 0,
                reasoning: subData.reasoning || "ผลลัพธ์นี้ได้รับการยืนยันโดยผู้ดูแลระบบ",
                heatmap: [],
                confidenceScore: 100,
                analysisDetails: {
                  grammar: "N/A",
                  depth: "N/A",
                  wordUsage: "N/A"
                },
                isCorrected: true,
                modelUsed: subData.modelUsed || "Administrator"
              };
              setResult(fallbackResult);
              setStreamingReasoning(fallbackResult.reasoning);
              setSubmissionId(subId);
              setIsCached(true);
              setIsAnalyzing(false);
              return;
            }

            const resData = resSnapshot.docs[0].data();
            const correctedResult: AnalysisResult = {
              score: resData.cheatingScore,
              reasoning: resData.reasoning,
              heatmap: resData.heatmap || [],
              confidenceScore: resData.confidenceScore || 100,
              analysisDetails: resData.analysisDetails || {
                grammar: "N/A",
                depth: "N/A",
                wordUsage: "N/A"
              },
              isCorrected: true, // Flag for UI
              modelUsed: resData.modelUsed || subData.modelUsed || "Administrator"
            };
            
            setResult(correctedResult);
            setStreamingReasoning(correctedResult.reasoning);
            setSubmissionId(subId);
            setIsCached(true);
            setIsAnalyzing(false);
            return;
          }

          // PRIORITY 2: Check for 'analyzed' status
          const analyzedDoc = docs.find(d => d.data().status === 'analyzed');
          if (analyzedDoc) {
            const subData = analyzedDoc.data();
            
            // If disputed, we SKIP cache and re-analyze with Gemini
            if (subData.disputed) {
              console.log("Submission is disputed. Re-analyzing...");
            } else {
              const subId = analyzedDoc.id;
              const resQ = query(collection(db, 'analysisResults'), where('submissionId', '==', subId), limit(1));
              const resSnapshot = await getDocs(resQ);
              
              if (!resSnapshot.empty) {
                const resData = resSnapshot.docs[0].data();
                const cachedResult: AnalysisResult = {
                  score: resData.cheatingScore,
                  reasoning: resData.reasoning,
                  heatmap: resData.heatmap || [],
                  confidenceScore: resData.confidenceScore || 100,
                  analysisDetails: resData.analysisDetails || {
                    grammar: "N/A",
                    depth: "N/A",
                    wordUsage: "N/A"
                  },
                  modelUsed: resData.modelUsed || subData.modelUsed
                };
                
                setResult(cachedResult);
                setStreamingReasoning(cachedResult.reasoning);
                setSubmissionId(subId);
                setIsCached(true);
                setIsAnalyzing(false);
                return;
              }
            }
          }
        }
      }

      if (file) {
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          promptText += `\n\n[เนื้อหาจากไฟล์ DOCX]:\n${result.value}`;
        } else if (file.type === 'application/pdf' || file.type === 'image/png') {
          const base64 = await fileToBase64(file);
          parts.push({
            inlineData: {
              data: base64,
              mimeType: file.type
            }
          });
        }
      }

      // 1.5 Adaptive Truncation
      let finalPromptText = promptText;
      if (promptText.length > 10000) {
        const head = promptText.slice(0, 4000);
        const middle = promptText.slice(Math.floor(promptText.length / 2) - 1000, Math.floor(promptText.length / 2) + 1000);
        const tail = promptText.slice(-4000);
        finalPromptText = `${head}\n\n[...ส่วนกลางที่ถูกตัดออก...]\n\n${middle}\n\n[...ส่วนท้ายที่ถูกตัดออก...]\n\n${tail}`;
      }

      // 1.6 Smart Intelligent Router (SIR)
      let modelToUse: string = selectedModel;
      let routing: ModelRouting | null = null;
      
      if (selectedModel === 'auto') {
        // เลเยอร์ที่ 1: Input Classifier
        const inputType = classifyInput(file, promptText);
        
        // เลเยอร์ที่ 2: Specialization Detection
        const specialization = detectSpecialization(promptText, file);
        
        // เลเยอร์ที่ 2: Routing Logic (พิจารณา Health Status ด้วย)
        routing = selectModel(inputType, specialization, apiHealth || undefined);
        modelToUse = routing.primary;
        setFallbackChain(routing.fallback);
        
        console.log('SIR Routing:', {
          inputType,
          specialization,
          primary: modelToUse,
          fallback: routing.fallback
        });
      }
      setActualModelUsed(modelToUse);

      // 2. RAG & Text Truncation
      let ragContext = "";
      if (promptText) {
        // Truncate for embedding if too long (keep intro and conclusion)
        const truncatedText = promptText.length > 2000 
          ? promptText.slice(0, 1000) + "\n...\n" + promptText.slice(-1000)
          : promptText;

        const [embedding] = await Promise.all([
          genAI.models.embedContent({
            model: 'gemini-embedding-2-preview',
            contents: [truncatedText],
          }).then(res => res.embeddings[0].values)
        ]);

        // Fetch patterns for RAG
        const patternsSnap = await getDocs(collection(db, 'patterns'));
        const similarPatterns = patternsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .map(p => ({ ...p, similarity: cosineSimilarity(embedding, p.embedding) }))
          .filter(p => p.similarity > 0.7) // Increased threshold for better accuracy
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        if (similarPatterns.length > 0) {
          ragContext = "\n\n**ข้อมูลการเรียนรู้จากผู้ดูแลระบบ (Admin Learning Context)**:\n" + 
            similarPatterns.map(p => `- คำตัดสิน: ${p.label === 'cheating' ? 'ทุจริต (AI)' : 'ปกติ (มนุษย์)'}\n  เนื้อหาใกล้เคียง: ${p.text.slice(0, 300)}...`).join('\n');
        }
      }

      const systemInstruction = `
คุณคือผู้เชี่ยวชาญด้านการตรวจจับเนื้อหาที่สร้างโดย AI วิเคราะห์ข้อความเพื่อหาโอกาสในการใช้ AI สร้างข้อความ

เกณฑ์การวิเคราะห์:
1. ไวยากรณ์ - ตรวจสอบความถูกต้องและความสม่ำเสมอของภาษา
2. ความลึกซึ้ง - ตรวจสอบความซับซ้อนและความเป็นเอกลักษณ์ของเนื้อหา
3. การใช้คำเชื่อม - ตรวจสอบความหลากหลายและความเป็นธรรมชาติของการเชื่อมโยง

**กฎสำคัญสำหรับการเรียนรู้จาก Admin (Learning Loop)**:
1. หาก Admin ยืนยันว่าเนื้อหาเป็น 'AI (ทุจริต)' ให้ปรับคะแนน AI ขึ้นไปที่ 80-100 ทันที
2. หาก Admin ยืนยันว่าเนื้อหาเป็น 'มนุษย์ (ปกติ)' ให้ปรับคะแนน AI ลงไปที่ 0-30 ทันที
3. ในส่วน reasoning ให้ระบุว่าได้อ้างอิงการปรับคะแนนจาก Admin Learning Context หรือไม่

**สำคัญ**: 
- score 0-100 โดย 100 = AI สร้าง, 0 = มนุษย์เขียน
- ตอบเป็น JSON เท่านั้น (ห้ามมีคำอธิบายเพิ่ม):
{
  "score": 0-100,
  "confidenceScore": 0-100,
  "reasoning": "สรุปสั้นๆ 2-3 บรรทัด ภาษาไทย",
  "analysisDetails": { "grammar": "...", "depth": "...", "wordUsage": "..." },
  "heatmap": [{ "text": "...", "score": 0-100 }]
}
`;

      parts.push({
        text: `วิเคราะห์เนื้อหาต่อไปนี้:\n${finalPromptText}\n${ragContext}`
      });

    // Intelligent Fallback Logic with Chain of Fallback
    let currentModel = modelToUse;
    let currentFallbackChain = selectedModel === 'auto' ? fallbackChain : [];
    let analysisResult: AnalysisResult;
    let lastError: Error | null = null;
    let attemptCount = 0;
    const maxFallbackAttempts = currentFallbackChain.length + 1;

    while (attemptCount < maxFallbackAttempts) {
      attemptCount++;
      console.log(`Attempt ${attemptCount}/${maxFallbackAttempts}: Using model ${currentModel}`);
      
      try {
        if (currentModel === 'thaillm-playground') {
          const response = await fetch('/api/analyze-thaillm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: '/model',
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `วิเคราะห์เนื้อหาต่อไปนี้:\n${finalPromptText}\n${ragContext}` }
              ],
              max_tokens: 2048,
              temperature: 0.3
            })
          });

          if (!response.ok) {
            let errorMessage = `ThaiLLM API error (Status ${response.status})`;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
            } else {
              const text = await response.text();
              console.error('Server error response:', text);
            }
            throw new Error(errorMessage);
          }

          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Expected JSON but received:', text);
            throw new Error('Received non-JSON response from server');
          }

          const data = await response.json();
          const content = data.choices[0].message.content.replace(/```json\n?|```/g, '').trim();
          analysisResult = JSON.parse(content);
          analysisResult.modelUsed = 'ThaiLLM Playground';
          
          // Success - break out of fallback loop
          break;
        } else {
          // Gemini models
          const callGeminiAPI = async (model: string): Promise<any> => {
            return await genAI.models.generateContentStream({
              model: model,
              contents: { parts },
              config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    confidenceScore: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    analysisDetails: {
                      type: Type.OBJECT,
                      properties: {
                        grammar: { type: Type.STRING },
                        depth: { type: Type.STRING },
                        wordUsage: { type: Type.STRING }
                      },
                      required: ["grammar", "depth", "wordUsage"]
                    },
                    heatmap: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          score: { type: Type.NUMBER }
                        },
                        required: ["text", "score"]
                      }
                    }
                  },
                  required: ["score", "confidenceScore", "reasoning", "analysisDetails", "heatmap"]
                }
              }
            });
          };

          const responseStream = await callGeminiAPI(currentModel);

          let fullText = "";
          for await (const chunk of responseStream) {
            const chunkText = chunk.text;
            fullText += chunkText;
            
            const reasoningMatch = fullText.match(/"reasoning":\s*"((?:[^"\\]|\\.)*)"/);
            if (reasoningMatch && reasoningMatch[1]) {
              const unescaped = reasoningMatch[1]
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\');
              setStreamingReasoning(unescaped);
            }
          }

          analysisResult = JSON.parse(fullText);
          analysisResult.modelUsed = currentModel;
          
          // Success - break out of fallback loop
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.error(`Model ${currentModel} failed:`, err.message);
        
        // Try next model in fallback chain
        const nextModel = getNextModel(currentModel, currentFallbackChain);
        if (nextModel) {
          console.log(`Falling back to ${nextModel}...`);
          currentModel = nextModel;
        } else {
          // No more fallbacks
          console.error('All models failed');
          break;
        }
      }
    }

    // Check if all attempts failed
    if (!analysisResult && lastError) {
      if (selectedModel === 'auto') {
        throw new Error(`ระบบ SIR ล้มเหลวทั้งหมด (ลอง ${maxFallbackAttempts} models): ${lastError.message}. กรุณาเลือกโมเดลด้วยตัวเองจาก dropdown`);
      } else {
        throw lastError;
      }
    }

    setResult(analysisResult);
    setStreamingReasoning(analysisResult.reasoning);
      
      // Update client cache
      if (cacheKey) {
        analysisCache.current.set(cacheKey, analysisResult);
      }

      // Parallel Firebase Storage (Faster Performance)
      const subRefPromise = addDoc(collection(db, 'submissions'), {
        text: promptText || `[File: ${file?.name}]`,
        textHash: textHash,
        status: 'analyzed',
        modelUsed: modelToUse,
        timestamp: new Date().toISOString(),
        isAnonymous: true,
        disputed: false
      });

      const subRef = await subRefPromise;
      setSubmissionId(subRef.id);

      await addDoc(collection(db, 'analysisResults'), {
        submissionId: subRef.id,
        cheatingScore: analysisResult.score,
        confidenceScore: analysisResult.confidenceScore,
        reasoning: analysisResult.reasoning,
        analysisDetails: analysisResult.analysisDetails,
        heatmap: analysisResult.heatmap,
        modelUsed: modelToUse,
        timestamp: new Date().toISOString()
      });

    } catch (err: any) {
      console.error("Analysis failed:", err);
      if (err.message?.includes('leaked')) {
        setError('⚠️ ตรวจพบว่า API Key หลุดสู่สาธารณะ (Leaked API Key) กรุณาติดต่อผู้ดูแลระบบเพื่อเปลี่ยน Key ใหม่ใน AI Studio Secrets');
      } else if (err.message?.includes('PERMISSION_DENIED')) {
        setError('⚠️ สิทธิ์การเข้าถึงถูกปฏิเสธ (Permission Denied) กรุณาตรวจสอบการตั้งค่า API Key');
      } else if (err.message?.includes('503') || err.message?.includes('UNAVAILABLE') || err.message?.includes('high demand')) {
        setError('⚠️ ขณะนี้มีผู้ใช้งานหนาแน่น (High Demand) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
      } else {
        setError('เกิดข้อผิดพลาดในการวิเคราะห์ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
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
    <>
      {/* Loading Screen */}
      <AnimatePresence>
        {isLoadingScreen && (
          <LoadingScreen />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="min-h-screen bg-[#f8fafc] text-zinc-900 font-sans selection:bg-blue-500/30 relative overflow-hidden">
      {/* Grand Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <FloatingParticles />
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-100/40 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-indigo-100/30 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] bg-sky-100/20 rounded-full blur-[150px]" />
      </div>

      <header className="h-16 md:h-24 border-b border-zinc-200/50 flex items-center justify-between px-4 md:px-8 sticky top-0 bg-white/60 backdrop-blur-xl z-40">
        <Logo />
        <div className="flex items-center gap-2 md:gap-4">
          {/* API Health Status */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-white/50 border border-zinc-200/50 rounded-full shadow-sm backdrop-blur-sm group relative cursor-help" title={apiHealth ? Object.entries(apiHealth.models).map(([name, m]) => `${name}: ${m.status === 'ok' ? '✓' : '✗'}`).join('\n') : ''}>
            {apiHealth?.status === 'loading' ? (
              <>
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">กำลังตรวจสอบ...</span>
              </>
            ) : apiHealth && apiHealth.workingModels > 0 ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="text-[10px] font-mono font-bold text-green-600 uppercase tracking-wider">API พร้อมใช้งาน ({apiHealth.workingModels}/{apiHealth.totalModels})</span>
              </>
            ) : apiHealth?.status === 'degraded' ? (
              <>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                <span className="text-[10px] font-mono font-bold text-orange-600 uppercase tracking-wider">API บางส่วนไม่พร้อม ({apiHealth.workingModels}/{apiHealth.totalModels})</span>
              </>
            ) : apiHealth?.status === 'unhealthy' ? (
              <>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                <span className="text-[10px] font-mono font-bold text-red-600 uppercase tracking-wider">API ไม่พร้อมใช้งาน</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-zinc-400 rounded-full" />
                <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">ไม่ทราบสถานะ</span>
              </>
            )}
            {/* Tooltip */}
            {apiHealth && apiHealth.status !== 'healthy' && (
              <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-white border border-zinc-200 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="text-xs font-bold text-zinc-700 mb-2">สถานะ API Models:</div>
                {Object.entries(apiHealth.models).map(([name, m]) => (
                  <div key={name} className={cn("flex items-center justify-between text-xs py-1", m.status === 'ok' ? 'text-green-600' : 'text-red-600')}>
                    <span className="truncate max-w-[140px]">{name}</span>
                    <span className="font-bold">{m.status === 'ok' ? '✓ พร้อม' : '✗ ไม่พร้อม'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {user ? (
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] md:text-xs font-bold text-zinc-900 line-clamp-1 max-w-[100px]">{user.displayName}</span>
                <span className="text-[8px] md:text-[10px] font-mono text-zinc-400 uppercase tracking-widest">{isAdmin ? 'Admin' : 'User'}</span>
              </div>
              {isAdmin && (
                <a 
                  href="/admin"
                  className="p-2 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-all shadow-sm text-zinc-400 hover:text-blue-500"
                  title="จัดการระบบ"
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
              className="px-4 py-2 bg-zinc-900 text-white text-[10px] font-black rounded-full uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg"
            >
              Admin Login
            </button>
          )}
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 md:space-y-16 relative z-10">
        <section className="space-y-6 md:space-y-8">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2 md:mb-4"
            >
              <Zap className="w-3 h-3" />
              Powered by Gemini 3 Flash
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-4xl font-serif font-black tracking-tight text-zinc-900"
            >
              ตรวจสอบความโปร่งใสของข้อมูล
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 text-base md:text-lg leading-relaxed"
            >
              วางข้อความหรืออัปโหลดไฟล์เพื่อวิเคราะห์ความเป็นมนุษย์ vs AI ด้วยเทคโนโลยีตรวจจับที่แม่นยำที่สุด
            </motion.p>
          </div>

          {isAdmin && (
            <div className="flex justify-center mb-8">
              <a 
                href="/admin"
                className="flex items-center gap-3 px-8 py-4 bg-white text-blue-600 border-2 border-blue-100 rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl hover:border-blue-200 hover:bg-blue-50"
              >
                <Shield className="w-5 h-5" />
                เปิดแผงควบคุมแอดมิน
              </a>
            </div>
          )}

          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/80 border border-white/20 rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] backdrop-blur-2xl overflow-hidden"
          >
            <div className="p-6 md:p-8 space-y-6 md:space-y-8">
              <div className="space-y-4 relative">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">ข้อความที่ต้องการตรวจสอบ</label>
                <div className="relative overflow-hidden rounded-2xl">
                  <textarea 
                    placeholder="วางข้อความที่นี่..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full h-48 md:h-64 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 md:p-6 font-sans text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                  />
                  {isAnalyzing && (
                    <motion.div 
                      className="absolute top-0 left-0 w-full h-1 bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.8)] z-10"
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">การกำหนดค่า AI Model</label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <select 
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value as any)}
                      className="flex-1 px-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="auto">🤖 Auto Routing (แนะนำ)</option>
                      <option value="gemini-3.1-flash-lite-preview">⚡ Gemini 3.1 Flash Lite (เร็ว/ประหยัด)</option>
                      <option value="gemini-3-flash-preview">🎯 Gemini 3 Flash (แม่นยำสูง)</option>
                      <option value="gemini-3.1-flash-live-preview">🔥 Gemini 3.1 Flash Live (สดใหม่)</option>
                      <option value="thaillm-playground">🇹🇭 ThaiLLM Playground (Pathumma)</option>
                    </select>
                    {(inputText || file) && (
                      <button 
                        onClick={clearForm}
                        className="px-6 py-4 border border-zinc-200 rounded-2xl text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        ล้างข้อมูล
                      </button>
                    )}
                  </div>
                  {/* SIR Info Display */}
                  {selectedModel === 'auto' && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-blue-600" />
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Smart Intelligent Router (SIR)</span>
                      </div>
                      {actualModelUsed && (
                        <div className="text-[10px] text-zinc-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Model ที่ใช้:</span>
                            <span className="font-mono text-blue-600">{actualModelUsed}</span>
                          </div>
                          {fallbackChain.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Fallback Chain:</span>
                              <span className="font-mono text-zinc-500">{fallbackChain.join(' → ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">อัปโหลดไฟล์ (DOCX, PDF, PNG)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".docx,.pdf,.png"
                    />
                    <label 
                      htmlFor="file-upload"
                      className="flex items-center justify-center gap-3 w-full py-4 border-2 border-dashed border-zinc-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
                    >
                      <motion.div
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Upload className="w-5 h-5 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                      </motion.div>
                      <span className="text-sm font-medium text-zinc-500 group-hover:text-blue-600">
                        {file ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์เพื่ออัปโหลด'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

                <div className="flex items-end">
                  <AnimatePresence>
                    {file && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex items-center justify-between w-full p-4 bg-blue-50 border border-blue-100 rounded-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            {file.type.includes('image') ? <ImageIcon className="w-5 h-5 text-blue-500" /> : 
                             file.type.includes('pdf') ? <File className="w-5 h-5 text-red-500" /> : 
                             <FileText className="w-5 h-5 text-blue-600" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-800 line-clamp-1">{file.name}</span>
                            <span className="text-[10px] font-mono text-zinc-400">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                        <button 
                          onClick={removeFile}
                          className="p-1 hover:bg-blue-100 rounded-full text-blue-400 hover:text-blue-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600">
                  {error}
                </div>
              )}

              <button 
                onClick={performAnalysis}
                disabled={isAnalyzing || (!inputText && !file)}
                className="w-full py-5 bg-zinc-900 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl relative overflow-hidden group"
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    กำลังวิเคราะห์ข้อมูล...
                    <motion.div 
                      className="absolute bottom-0 left-0 h-1 bg-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 5, ease: "linear" }}
                    />
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    ทดสอบข้อมูล
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </section>

        <AnimatePresence>
          {isAnalyzing && !result && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="bg-white/50 border border-zinc-200/50 rounded-[2.5rem] p-8 animate-pulse relative overflow-hidden">
                <motion.div 
                  className="absolute top-0 left-0 w-full h-1 bg-blue-400/20 shadow-[0_0_15px_rgba(96,165,250,0.3)] z-10"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                  <div className="aspect-square bg-zinc-100 rounded-full max-w-[300px] mx-auto" />
                  <div className="space-y-6">
                    <div className="h-8 bg-zinc-100 rounded-lg w-1/2" />
                    <div className="space-y-3">
                      <div className="h-4 bg-zinc-100 rounded w-full" />
                      <div className="h-4 bg-zinc-100 rounded w-5/6" />
                      <div className="h-4 bg-zinc-100 rounded w-4/6" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {result && (
            <motion.section 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {result.isCorrected && (
                <div className="flex items-center gap-3 px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs font-bold text-emerald-700 shadow-sm w-fit mx-auto animate-bounce">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                  <span>ผลลัพธ์นี้ได้รับการยืนยันความถูกต้องโดยผู้ดูแลระบบแล้ว</span>
                </div>
              )}

              {isCached && !result.isCorrected && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-full text-[10px] font-bold text-amber-600 uppercase tracking-widest w-fit mx-auto">
                  <History className="w-3 h-3" />
                  แสดงผลจากหน่วยความจำ (Cached)
                </div>
              )}

              <div className="bg-white border border-zinc-200 rounded-[1.5rem] md:rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] p-6 md:p-10 space-y-8 md:space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
                  <div className="flex flex-col items-center gap-2 md:gap-6">
                    <div className="relative w-full max-w-[320px] flex flex-col items-center">
                      <GaugeMeter score={result.score} label="ความน่าจะเป็นของ AI" />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "mt-[-20px] md:mt-[-40px] px-6 py-2 text-white text-[10px] md:text-xs font-black rounded-full uppercase tracking-widest shadow-xl z-20 whitespace-nowrap",
                          result.score > 50 ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]" : "bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                        )}
                      >
                        {result.score > 50 ? 'AI Generated' : 'Human Written'}
                      </motion.div>
                    </div>

                    {result.modelUsed && (
                      <div className="mt-2 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-50 border border-zinc-100 rounded-md text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          <Zap className="w-3 h-3" />
                          Analyzed by {result.modelUsed.replace('-preview', '').replace(/-/g, ' ')}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-6 justify-center">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                        <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-widest">AI / ทุจริต</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase tracking-widest">มนุษย์ / ปกติ</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                            <BrainCircuit className="w-4 h-4 text-blue-600" />
                          </div>
                          <h3 className="text-2xl font-serif font-black text-zinc-900">ผลการวิเคราะห์</h3>
                        </div>
                        {result.confidenceScore < 60 && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                            <AlertTriangle className="w-3 h-3" />
                            ความมั่นใจต่ำ
                          </div>
                        )}
                      </div>
                      <div className="h-1 w-16 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
                    </div>
                    
                    <div className="prose prose-zinc prose-sm max-w-none text-zinc-600 leading-relaxed min-h-[100px]">
                      {result.confidenceScore < 40 ? (
                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl text-amber-700 italic">
                          "ข้อมูลไม่เพียงพอที่จะระบุได้ชัดเจน ระบบมีความมั่นใจในการวิเคราะห์ต่ำเกินไป โปรดตรวจสอบด้วยตนเองเพิ่มเติม"
                        </div>
                      ) : (
                        <div className="relative">
                          <Markdown>{streamingReasoning}</Markdown>
                          {isAnalyzing && (
                            <motion.span 
                              className="inline-block w-1 h-4 bg-blue-500 ml-1 align-middle"
                              animate={{ opacity: [0, 1, 0] }}
                              transition={{ duration: 0.8, repeat: Infinity }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Multi-Persona Details */}
                    {result.analysisDetails && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-3">
                        <AnalysisDetailItem label="โครงสร้างไวยากรณ์" value={result.analysisDetails.grammar} />
                        <AnalysisDetailItem label="ความลึกซึ้งของเนื้อหา" value={result.analysisDetails.depth} />
                        <AnalysisDetailItem label="รูปแบบการใช้คำเชื่อม" value={result.analysisDetails.wordUsage} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Heatmap Section */}
                {result.heatmap && result.heatmap.length > 0 && (
                  <div className="space-y-6 pt-8 border-t border-zinc-100">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Heatmap Scoring</h4>
                      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-green-500 rounded-full" /> มนุษย์</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-500 rounded-full" /> AI</div>
                      </div>
                    </div>
                    <div className="p-4 md:p-8 bg-zinc-50 border border-zinc-100 rounded-[1.5rem] md:rounded-[2rem] leading-relaxed text-zinc-800 font-serif text-base md:text-lg">
                      {result.heatmap.map((seg, i) => {
                        // Interpolate color based on score
                        // 0 (Human) -> Green, 100 (AI) -> Red
                        const isAI = seg.score > 50;
                        const isHighAI = seg.score > 80;
                        const opacity = Math.abs(seg.score - 50) / 50 * 0.2 + 0.05;
                        const bgColor = isAI ? `rgba(239, 68, 68, ${opacity})` : `rgba(34, 197, 94, ${opacity})`;
                        const borderColor = isAI ? `rgba(239, 68, 68, ${opacity + 0.1})` : `rgba(34, 197, 94, ${opacity + 0.1})`;
                        
                        return (
                          <motion.span 
                            key={i} 
                            style={{ backgroundColor: bgColor, borderBottom: `2px solid ${borderColor}` }}
                            className={cn(
                              "px-0.5 rounded-sm transition-all hover:brightness-95 cursor-help inline-block",
                              isHighAI && "animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                            )}
                            title={`AI Confidence: ${seg.score}%`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            {seg.text}
                          </motion.span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="p-6 bg-zinc-50/50 border border-zinc-100 rounded-[2rem] flex items-start gap-4">
                    <AlertTriangle className="w-5 h-5 text-zinc-300 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-zinc-400 leading-relaxed">
                      ผลการวิเคราะห์นี้เป็นเพียงการประเมินเบื้องต้นโดยปัญญาประดิษฐ์ (AI) 
                      ซึ่งอาจมีความคลาดเคลื่อนในบางกรณี โปรดใช้วิจารณญาณและตรวจสอบข้อมูลเพิ่มเติมเพื่อความถูกต้องสูงสุด
                    </p>
                  </div>

                  <div className="pt-8 border-t border-zinc-100">
                    <AnimatePresence mode="wait">
                      {disputeStatus === 'submitted' ? (
                        <motion.div 
                          key="submitted"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-4 p-6 bg-green-50 border border-green-100 rounded-[2rem] text-green-700 shadow-sm"
                        >
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                            <motion.div
                              initial={{ scale: 0, rotate: -45 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: "spring", stiffness: 200, damping: 10 }}
                            >
                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                            </motion.div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-black">ส่งคำโต้แย้งเรียบร้อยแล้ว</span>
                            <span className="text-xs opacity-80 font-medium">แอดมินจะตรวจสอบข้อมูลและนำไปพัฒนาระบบให้แม่นยำยิ่งขึ้น</span>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="form"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="space-y-6"
                        >
                          <div className="flex items-center gap-3">
                            <MessageSquare className="w-5 h-5 text-blue-500" />
                            <h4 className="text-sm font-black text-zinc-900">ผลลัพธ์ไม่ถูกต้อง? ช่วยเราปรับปรุงระบบ</h4>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                              onClick={() => setDisputeType('claim_human')}
                              className={cn(
                                "flex items-center gap-3 p-4 border rounded-2xl transition-all font-bold text-sm",
                                disputeType === 'claim_human' ? "bg-blue-50 border-blue-200 text-blue-600 ring-2 ring-blue-100" : "bg-white border-zinc-200 text-zinc-500 hover:border-blue-200"
                              )}
                            >
                              <User className="w-5 h-5" />
                              ข้อความนี้เขียนโดยมนุษย์
                            </button>
                            <button 
                              onClick={() => setDisputeType('claim_ai')}
                              className={cn(
                                "flex items-center gap-3 p-4 border rounded-2xl transition-all font-bold text-sm",
                                disputeType === 'claim_ai' ? "bg-red-50 border-red-200 text-red-600 ring-2 ring-red-100" : "bg-white border-zinc-200 text-zinc-500 hover:border-red-200"
                              )}
                            >
                              <Bot className="w-5 h-5" />
                              ข้อความนี้เขียนโดย AI
                            </button>
                          </div>

                          <textarea 
                            placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)..."
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            rows={3}
                          />

                          <button 
                            onClick={handleDispute}
                            disabled={disputeStatus === 'submitting'}
                            className="w-full py-4 bg-white border border-zinc-900 text-zinc-900 rounded-2xl text-sm font-black hover:bg-zinc-900 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 group"
                          >
                            {disputeStatus === 'submitting' ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                            )}
                            ส่งคำโต้แย้งไปยังแอดมิน
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* History Section */}
        {history.length > 0 && (
          <motion.section 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8 pt-16 border-t border-zinc-200/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-zinc-100 flex items-center justify-center">
                  <History className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-black text-zinc-900">ประวัติการตรวจสอบล่าสุด</h3>
                  <p className="text-xs text-zinc-500">ข้อมูล 5 รายการล่าสุดที่ถูกวิเคราะห์</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {history.map((item) => (
                <motion.div 
                  key={item.id}
                  whileHover={{ y: -4 }}
                  className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group relative"
                >
                  <button 
                    onClick={() => deleteHistoryItem(item.id)}
                    className="absolute top-4 right-4 p-2 bg-zinc-50 rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                        {item.timestamp ? new Date(item.timestamp).toLocaleDateString('th-TH', { 
                          day: 'numeric', 
                          month: 'short', 
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'N/A'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-800 line-clamp-2 min-h-[2.5rem]">
                      {item.text}
                    </p>
                    <div className="pt-4 border-t border-zinc-50 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">สถานะ: วิเคราะห์แล้ว</span>
                        {item.modelUsed && (
                          <span className="text-[8px] font-mono text-blue-400 font-bold uppercase tracking-widest">
                            AI: {item.modelUsed.replace('-preview', '').replace(/-/g, ' ')}
                          </span>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setInputText(item.text);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline"
                      >
                        ตรวจสอบอีกครั้ง
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <footer className="p-12 text-center border-t border-zinc-100">
        <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
          &copy; 2026 EduGuard AI - พลิกเกมกลโกง
        </p>
      </footer>
    </div>
    </>
  );
};

function AnalysisDetailItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl space-y-1">
      <div className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">{label}</div>
      <div className="text-xs text-zinc-600 font-medium">{value}</div>
    </div>
  );
}

function AnalysisDetailItemSkeleton() {
  return (
    <div className="p-3 bg-zinc-50 border border-zinc-100 rounded-xl space-y-2 animate-pulse">
      <div className="h-2 bg-zinc-200 rounded w-1/4" />
      <div className="h-3 bg-zinc-200 rounded w-3/4" />
    </div>
  );
}

export default PublicHome;
