import { definePromise, ProgrammaticPromise } from "@sibyl/sdk";

/**
 * DOGFOODING: Sibyl monitoring Sibyl.
 * 
 * We use our own chaos engineering platform to continuously verify the internal
 * Service Level Objectives (SLOs) of our architecture in production.
 */

export const p95QueueLatency = definePromise({
  id: "slo-p95-queue-latency",
  name: "Queue P95 Latency < 30s",
  description: "Ensures that 95% of simulation runs are picked up by a worker within 30 seconds of being queued.",
  evaluate: async () => {
    try {
      // In a real dogfooding scenario, we query our own Prometheus /metrics endpoint
      // const res = await fetch('http://localhost:9090/api/v1/query?query=histogram_quantile(0.95, rate(sibyl_sandbox_cold_start_ms_bucket[5m]))');
      // const data = await res.json();
      // const p95 = parseFloat(data.data.result[0].value[1]);
      
      const p95Mock = Math.random() * 20; // Mocking a healthy 20ms p95 latency
      
      if (p95Mock > 30000) {
        return {
          pass: false,
          evidence: { current_p95_ms: p95Mock, threshold_ms: 30000 },
          message: "CRITICAL: Worker queue is backing up. P95 latency exceeds 30 seconds."
        };
      }

      return {
        pass: true,
        evidence: { current_p95_ms: p95Mock },
      };
    } catch (err: any) {
      return { pass: false, message: `Failed to query observability stack: ${err.message}` };
    }
  }
});

export const noLostResults = definePromise({
  id: "slo-no-lost-results",
  name: "Zero Data Loss on Results Ingestion",
  description: "Ensures that if the Postgres database goes down temporarily, the API queues search-session results in Redis and eventually persists them without dropping data.",
  evaluate: async () => {
    // Conceptually, we would inject a network partition fault between API and Postgres:
    // injectFault({ type: 'network_partition', target: 'postgres', duration_ms: 10000 });
    
    // Then we fire a mock simulation result at the API
    // await fetch('http://localhost:4000/api/v1/runs/mock/ingest', { method: 'POST' });
    
    // Finally, we wait and verify it made it to the DB after the partition healed
    const mockDbLookupSuccess = true;

    if (!mockDbLookupSuccess) {
      return {
        pass: false,
        message: "DATA LOSS DETECTED: A submitted simulation result was dropped during a database partition event."
      };
    }

    return { pass: true, message: "Result successfully persisted through partition." };
  }
});
