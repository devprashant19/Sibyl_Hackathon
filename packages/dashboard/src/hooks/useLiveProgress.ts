import { useState, useEffect, useCallback } from 'react';

export interface SearchSessionProgress {
  sessionId: string;
  totalRuns: number;
  completed: number;
  failures: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  latestFailures: string[]; // runIds
}

export function useLiveProgress(sessionId: string, apiUrl: string) {
  const [progress, setProgress] = useState<SearchSessionProgress>({
    sessionId,
    totalRuns: 0,
    completed: 0,
    failures: 0,
    status: 'PENDING',
    latestFailures: []
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    console.log(`[SSE] Connecting to ${apiUrl}/runs/${sessionId}/progress`);
    const eventSource = new EventSource(`${apiUrl}/runs/${sessionId}/progress`);

    eventSource.onopen = () => {
      console.log('[SSE] Connected');
      setIsConnected(true);
      setProgress(p => ({ ...p, status: 'RUNNING' }));
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // data format expected from our pubsub: 
        // { orgId, sessionId, runId, status: 'COMPLETED'|'FAILED', ... }
        
        setProgress(prev => {
          // Basic deduplication could happen here based on runId, but for now we just aggregate
          const isFailure = data.status === 'FAILED';
          return {
            ...prev,
            completed: prev.completed + 1,
            failures: prev.failures + (isFailure ? 1 : 0),
            latestFailures: isFailure 
              ? [data.runId, ...prev.latestFailures].slice(0, 5) 
              : prev.latestFailures
          };
        });
      } catch (err) {
        console.error('[SSE] Failed to parse message', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[SSE] Connection error', err);
      setIsConnected(false);
      // EventSource automatically attempts to reconnect natively
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [sessionId, apiUrl]);

  // A helper function specifically for the mock demonstration
  const injectMockEvent = useCallback((isFailure: boolean, runId: string) => {
    setProgress(prev => ({
      ...prev,
      completed: prev.completed + 1,
      failures: prev.failures + (isFailure ? 1 : 0),
      latestFailures: isFailure ? [runId, ...prev.latestFailures].slice(0, 5) : prev.latestFailures
    }));
  }, []);

  // For the mock demo, we also allow setting total runs
  const setTotalRuns = useCallback((total: number) => {
    setProgress(prev => ({ ...prev, totalRuns: total }));
  }, []);

  return { progress, isConnected, injectMockEvent, setTotalRuns };
}
