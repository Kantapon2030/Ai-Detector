import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';

export interface ApiHealthData {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  totalModels: number;
  workingModels: number;
  avgLatency?: number;
  models: Record<string, {
    status: 'ok' | 'error';
    latency?: number;
    message?: string;
    errorDetails?: string;
  }>;
}

const CACHE_COLLECTION = 'apiHealthCache';
const CACHE_VALID_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds

/**
 * Save API health data to Firebase cache
 */
export async function saveApiHealthToCache(healthData: ApiHealthData): Promise<void> {
  try {
    // Create a document with timestamp as ID for easy querying
    const timestamp = new Date().toISOString();
    const docId = `health_${Date.now()}`;
    
    await setDoc(doc(db, CACHE_COLLECTION, docId), {
      ...healthData,
      timestamp,
      cachedAt: timestamp
    });

    // Clean up old cache entries (keep only the latest 10)
    const q = query(collection(db, CACHE_COLLECTION), orderBy('timestamp', 'desc'), limit(20));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs;
    
    // Delete entries beyond the latest 10
    if (docs.length > 10) {
      for (let i = 10; i < docs.length; i++) {
        await deleteDoc(doc(db, CACHE_COLLECTION, docs[i].id));
      }
    }

    console.log('API health data saved to cache');
  } catch (error) {
    console.error('Error saving API health to cache:', error);
  }
}

/**
 * Get API health data from Firebase cache
 */
export async function getApiHealthFromCache(): Promise<ApiHealthData | null> {
  try {
    const q = query(collection(db, CACHE_COLLECTION), orderBy('timestamp', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('No cached API health data found');
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data() as ApiHealthData;

    // Check if cache is still valid (within 2 minutes)
    if (isCacheValid(data.timestamp)) {
      console.log('Using cached API health data (valid)');
      return data;
    } else {
      console.log('Cached API health data is stale');
      return null;
    }
  } catch (error) {
    console.error('Error getting API health from cache:', error);
    return null;
  }
}

/**
 * Check if cache is still valid (within 2 minutes)
 */
export function isCacheValid(timestamp: string): boolean {
  const cacheTime = new Date(timestamp).getTime();
  const currentTime = Date.now();
  const age = currentTime - cacheTime;
  
  return age < CACHE_VALID_DURATION;
}

/**
 * Get cache age in seconds
 */
export function getCacheAge(timestamp: string): number {
  const cacheTime = new Date(timestamp).getTime();
  const currentTime = Date.now();
  return Math.floor((currentTime - cacheTime) / 1000);
}
