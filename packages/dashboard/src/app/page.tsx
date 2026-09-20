import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@sibyl/ui";
import { Badge } from "@sibyl/ui";
import { CodeBlock } from "@sibyl/ui";
import { ProgressTrack } from "@sibyl/ui";
import { OracleConsole } from "@sibyl/ui";

export default function Home() {
  const scenarios = [
    "Analyzing system entropy...\nDetecting anomaly in payment-service-v2.\nProbability of cascade: 87.4%",
    "Injecting network partition across eu-west-1 availability zones...\nObserving automated failover mechanics.",
    "Applying latency to PostgreSQL primary node (+400ms).\nConnection pool exhaustion imminent.",
  ];

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto space-y-12">
      <header className="space-y-4">
        <h1 className="text-5xl font-display text-gold tracking-tight">Sibyl</h1>
        <p className="text-muted text-lg font-body max-w-2xl">
          Foresight engine for resilient distributed systems. Design, execute, and observe 
          chaotic simulations across all boundaries.
        </p>
      </header>

      <section>
        <OracleConsole scenarios={scenarios} typingSpeedMs={35} pauseBetweenScenariosMs={4000} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Simulation RUN-8942</CardTitle>
              <Badge variant="pass">PASSED</Badge>
            </div>
            <CardDescription>Target: K8S_POD payment-api</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Injection Progress</span>
                <span className="text-parchment">100%</span>
              </div>
              <ProgressTrack value={100} indicatorColor="gold" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted">Last Event Payload:</p>
              <CodeBlock code={'{\n  "domain": "HTTP",\n  "type": "TIMEOUT",\n  "target": "/v1/charges"\n}'} />
            </div>
          </CardContent>
          <CardFooter>
            <button className="text-gold text-sm hover:underline font-semibold tracking-wide">
              VIEW DETAILED REPORT →
            </button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Simulation RUN-8943</CardTitle>
              <Badge variant="fail">FAILED</Badge>
            </div>
            <CardDescription>Target: DB_CLUSTER user-db-primary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Injection Progress</span>
                <span className="text-ember animate-pulse">HALTED (34%)</span>
              </div>
              <ProgressTrack value={34} indicatorColor="ember" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted">Error Output:</p>
              <CodeBlock className="text-ember" code={'FATAL: connection limit exceeded for non-superusers\nRollback initiated...'} />
            </div>
          </CardContent>
          <CardFooter>
            <button className="text-muted text-sm hover:text-parchment transition-colors font-semibold tracking-wide">
              INSPECT LOGS
            </button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
