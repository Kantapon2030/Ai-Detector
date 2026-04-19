import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Pattern {
  id: string;
  text: string;
  label: string;
  embedding: number[];
  similarity?: number;
}

interface PatternsContextType {
  patterns: Pattern[] | null;
  setPatterns: (patterns: Pattern[] | null) => void;
  isLoading: boolean;
}

const PatternsContext = createContext<PatternsContextType | undefined>(undefined);

const PATTERNS_CACHE_KEY = 'patterns_cache';
const CACHE_TIMESTAMP_KEY = 'patterns_cache_timestamp';
const CACHE_VALIDITY_DURATION = 10 * 60 * 1000; // 10 minutes

export const PatternsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load patterns from sessionStorage on mount
  useEffect(() => {
    try {
      const cachedPatterns = sessionStorage.getItem(PATTERNS_CACHE_KEY);
      const cachedTimestamp = sessionStorage.getItem(CACHE_TIMESTAMP_KEY);
      
      if (cachedPatterns && cachedTimestamp) {
        const timestamp = parseInt(cachedTimestamp, 10);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - timestamp < CACHE_VALIDITY_DURATION) {
          console.log('Loading patterns from sessionStorage cache');
          setPatterns(JSON.parse(cachedPatterns));
        } else {
          // Cache expired, clear it
          sessionStorage.removeItem(PATTERNS_CACHE_KEY);
          sessionStorage.removeItem(CACHE_TIMESTAMP_KEY);
        }
      }
    } catch (error) {
      console.error('Error loading patterns from sessionStorage:', error);
    }
  }, []);

  // Save patterns to sessionStorage whenever they change
  useEffect(() => {
    if (patterns && patterns.length > 0) {
      try {
        sessionStorage.setItem(PATTERNS_CACHE_KEY, JSON.stringify(patterns));
        sessionStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (error) {
        console.error('Error saving patterns to sessionStorage:', error);
      }
    }
  }, [patterns]);

  return (
    <PatternsContext.Provider value={{ patterns, setPatterns, isLoading }}>
      {children}
    </PatternsContext.Provider>
  );
};

export const usePatterns = () => {
  const context = useContext(PatternsContext);
  if (context === undefined) {
    throw new Error('usePatterns must be used within a PatternsProvider');
  }
  return context;
};
