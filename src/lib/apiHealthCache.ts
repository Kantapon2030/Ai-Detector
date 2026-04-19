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

const CACHE_KEY = 'apiHealthCache';
const CACHE_VALID_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds

/**
 * Save API health data to localStorage cache
 */
export async function saveApiHealthToCache(healthData: ApiHealthData): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const cacheData = {
      ...healthData,
      timestamp,
      cachedAt: timestamp
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    console.log('API health data saved to cache');
  } catch (error) {
    console.error('Error saving API health to cache:', error);
  }
}

/**
 * Get API health data from localStorage cache
 */
export async function getApiHealthFromCache(): Promise<ApiHealthData | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    
    if (!cached) {
      console.log('No cached API health data found');
      return null;
    }

    const data = JSON.parse(cached) as ApiHealthData;

    // Check if cache is still valid (within 2 minutes)
    if (isCacheValid(data.timestamp)) {
      console.log('Using cached API health data (valid)');
      return data;
    } else {
      console.log('Cached API health data is stale');
      localStorage.removeItem(CACHE_KEY);
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
