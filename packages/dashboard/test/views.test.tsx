import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunList } from '../src/app/(dashboard)/runs/components/RunList';
import { RunDetail } from '../src/app/(dashboard)/runs/components/RunDetail';
import { LiveSessions } from '../src/app/(dashboard)/runs/components/LiveSessions';
import RunExplorer from '../src/app/(dashboard)/runs/page';
import { PromiseTrends } from '../src/app/(dashboard)/trends/components/PromiseTrends';
import Marketplace from '../src/app/(dashboard)/marketplace/page';
import { ApiError, apiGet } from '../src/lib/api';
import type { PromiseTrend, RunDetail as RunDetailData, RunListItem } from '../src/lib/api-types';

// --- fixtures (shapes follow packages/shared/src/api-schemas.ts) ---

const T0 = Date.UTC(2026, 8, 14, 10, 23, 45, 10);

const failedRun: RunListItem = {
  runId: 'run-1',
  seed: '0x8f2c',
  status: 'FAILED',
  passed: false,
  concreteSchedules: [],
  promiseResults: [],
  durationMs: 450,
  eventCount: 2,
  sessionId: 'session-aaaaaaaa-1111',
  project: 'checkout',
  createdAt: T0,
  failedPromises: ['no-double-charges'],
};

const passedRun: RunListItem = {
  ...failedRun,
  runId: 'run-2',
  seed: '0x0001',
  status: 'COMPLETED',
  passed: true,
  failedPromises: [],
};

const failedRunDetail: RunDetailData = {
  ...failedRun,
  concreteSchedules: [
    {
      id: '6f1c1f5e-0000-4000-8000-000000000001',
      spec: { domain: 'HTTP', type: 'SLOW_RESPONSE', delayMs: 2000 },
      probability: 0.25,
    },
  ],
  promiseResults: [
    {
      promiseId: 'every-charge-has-receipt',
      simulationRunId: 'run-1',
      passed: true,
      severity: 'HIGH',
      evaluatedAt: T0,
    },
    {
      promiseId: 'no-double-charges',
      simulationRunId: 'run-1',
      passed: false,
      severity: 'CRITICAL',
      message: 'customer charged twice for order 42',
      evaluatedAt: T0,
    },
  ],
  events: [
    { domain: 'HTTP', id: 'e1', fault: 'HTTP_5XX', timestamp: T0, payload: { method: 'POST', url: '/api/charge', statusCode: 504, durationMs: 2001 } },
    { domain: 'DATABASE', id: 'e2', timestamp: T0 + 35, payload: { query: 'INSERT INTO charges', durationMs: 4 } },
  ],
  promises: [
    { id: 'no-double-charges', description: 'A customer is never charged twice', severity: 'CRITICAL' },
    { id: 'every-charge-has-receipt', description: 'Every charge gets a receipt', severity: 'HIGH' },
  ],
};

// --- fetch / EventSource mocks ---

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Route = (url: URL) => Response | Promise<Response>;

function mockFetch(route: Route) {
  const fn = vi.fn(async (input: RequestInfo | URL) => route(new URL(String(input))));
  vi.stubGlobal('fetch', fn);
  return fn;
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  static latest() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  open() {
    act(() => {
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    });
  }

  emit(data: unknown) {
    act(() => {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
    });
  }

  fail() {
    act(() => {
      this.onerror?.(new Event('error'));
    });
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RunList component', () => {
  it('renders loading skeleton', () => {
    const { container } = render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} isLoading />);
    expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders the "no runs yet" empty state', () => {
    render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.getByText(/run `sibyl run` with SIBYL_API_URL set/)).toBeInTheDocument();
  });

  it('renders an error state with retry', () => {
    const retry = vi.fn();
    render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} error={new Error('API Down')} onRetry={retry} />);
    expect(screen.getByText('Failed to load runs')).toBeInTheDocument();
    expect(screen.getByText('API Down')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('renders runs with status, failed promises and a deterministic UTC timestamp', () => {
    const onSelect = vi.fn();
    render(<RunList runs={[failedRun, passedRun]} selectedRunId="run-1" onSelectRun={onSelect} />);
    expect(screen.getByText('run-1')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText(/no-double-charges/)).toBeInTheDocument();
    expect(screen.getAllByText('2026-09-14 10:23:45 UTC')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('run-item-run-2'));
    expect(onSelect).toHaveBeenCalledWith('run-2');
  });
});

describe('RunDetail component', () => {
  it('renders loading skeleton', () => {
    const { container } = render(<RunDetail run={null} isLoading />);
    expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty/null state', () => {
    render(<RunDetail run={null} />);
    expect(screen.getByText('Select a run to view details.')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<RunDetail run={null} error={new Error('Failed to fetch details')} />);
    expect(screen.getByText('Failed to load run details')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch details')).toBeInTheDocument();
  });

  it('shows the failed promise, schedule, timeline and exact replay command', () => {
    render(<RunDetail run={failedRunDetail} />);
    expect(screen.getByText('run-1')).toBeInTheDocument();
    expect(screen.getByTestId('run-seed')).toHaveTextContent('0x8f2c');

    // Promises Tab (Default)
    const failed = screen.getByTestId('promise-no-double-charges');
    expect(within(failed).getByText('FAIL')).toBeInTheDocument();
    expect(within(failed).getByText('customer charged twice for order 42')).toBeInTheDocument();
    expect(within(failed).getByText('A customer is never charged twice')).toBeInTheDocument();
    expect(within(screen.getByTestId('promise-every-charge-has-receipt')).getByText('PASS')).toBeInTheDocument();

    // Schedule Tab
    fireEvent.click(screen.getByTestId('tab-schedule'));
    expect(screen.getByText('SLOW_RESPONSE')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('2000ms')).toBeInTheDocument();

    // Timeline Tab
    fireEvent.click(screen.getByTestId('tab-timeline'));
    const events = screen.getAllByTestId('timeline-event');
    expect(events).toHaveLength(2);
    expect(within(events[0]).getByText('10:23:45.010')).toBeInTheDocument();
    expect(within(events[0]).getByText(/POST \/api\/charge → 504/)).toBeInTheDocument();
    expect(within(events[1]).getByText('10:23:45.045')).toBeInTheDocument();
    expect(within(events[0]).getByTestId('timeline-fault')).toHaveTextContent('HTTP_5XX');
    expect(within(events[1]).queryByTestId('timeline-fault')).toBeNull();

    // Replay Tab
    fireEvent.click(screen.getByTestId('tab-replay'));
    expect(screen.getByTestId('replay-command')).toHaveTextContent('sibyl replay run-1');
    expect(screen.getByTestId('explain-command')).toHaveTextContent('sibyl explain run-1');
    expect(screen.queryByRole('button', { name: /explain/i })).not.toBeInTheDocument();
  });

  it('explains why passing runs have no timeline', () => {
    render(<RunDetail run={{ ...failedRunDetail, status: 'COMPLETED', passed: true, events: undefined, eventCount: 12 }} />);
    fireEvent.click(screen.getByTestId('tab-timeline'));
    expect(screen.getByText(/Passing runs are stored without a timeline \(12 events captured\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('explain-command')).not.toBeInTheDocument();
  });
});

describe('Run Explorer page (API wired)', () => {
  it('lists runs from the API and loads the newest run detail', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.pathname === '/api/v1/runs') return jsonResponse({ data: [failedRun, passedRun] });
      if (url.pathname === '/api/v1/runs/run-1') return jsonResponse({ data: failedRunDetail });
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
    });

    render(<RunExplorer />);

    expect(await screen.findByTestId('run-item-run-1')).toBeInTheDocument();
    expect(screen.getByTestId('run-item-run-2')).toBeInTheDocument();
    
    // Switch to Replay tab to see the command
    fireEvent.click(await screen.findByTestId('tab-replay'));
    expect(await screen.findByTestId('replay-command')).toHaveTextContent('sibyl replay run-1');
    
    // Switch to Promises tab to see the failure description
    fireEvent.click(screen.getByTestId('tab-promises'));
    expect(await screen.findByText('customer charged twice for order 42')).toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toContain('http://localhost:4000/api/v1/runs?limit=100');
    expect(urls).toContain('http://localhost:4000/api/v1/runs/run-1');
    expect(MockEventSource.latest().url).toBe('http://localhost:4000/api/v1/events');
  });

  it('passes the status filter to the API', async () => {
    const fetchMock = mockFetch((url) =>
      url.pathname === '/api/v1/runs' ? jsonResponse({ data: [] }) : jsonResponse({ data: failedRunDetail }),
    );
    render(<RunExplorer />);
    await screen.findByText('No runs yet');

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'FAILED' } });
    expect(await screen.findByText('No FAILED runs')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('http://localhost:4000/api/v1/runs?status=FAILED&limit=100');
  });

  it('shows the empty state when the API has no runs', async () => {
    mockFetch(() => jsonResponse({ data: [] }));
    render(<RunExplorer />);
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
  });

  it("shows a can't-reach-the-API error when the request fails, and retries", async () => {
    let up = false;
    const fetchMock = mockFetch((url) => {
      if (!up) throw new TypeError('Failed to fetch');
      return url.pathname === '/api/v1/runs' ? jsonResponse({ data: [] }) : jsonResponse({ data: failedRunDetail });
    });
    render(<RunExplorer />);

    expect(
      await screen.findByText("Can't reach the Sibyl API at http://localhost:4000. Start it with `pnpm --filter @sibyl/api start`."),
    ).toBeInTheDocument();

    up = true;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('No runs yet')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces ApiErrorResponse messages from non-2xx responses', async () => {
    mockFetch(() => jsonResponse({ error: { code: 'INTERNAL', message: 'storage unavailable' } }, 500));
    render(<RunExplorer />);
    expect(await screen.findByText('storage unavailable (HTTP 500)')).toBeInTheDocument();
  });
});

describe('LiveSessions (SSE)', () => {
  it('tracks progress → completed from /api/v1/events and cleans up on unmount', () => {
    const onCompleted = vi.fn();
    const { unmount } = render(<LiveSessions onSessionCompleted={onCompleted} />);
    const es = MockEventSource.latest();
    expect(es.url).toBe('http://localhost:4000/api/v1/events');
    expect(screen.getByText(/No sessions in flight/)).toBeInTheDocument();

    es.open();
    expect(screen.getByTestId('live-connection')).toHaveTextContent('Live');

    es.emit({ type: 'progress', sessionId: 's-1', project: 'checkout', done: 3, total: 10, failures: 1, lastRun: { runId: 'r-3', status: 'FAILED' } });
    const card = screen.getByTestId('live-session-s-1');
    expect(within(card).getByTestId('live-session-count')).toHaveTextContent('3 / 10');
    expect(within(card).getByText('RUNNING')).toBeInTheDocument();
    expect(within(card).getByText('1 failure')).toBeInTheDocument();

    // Counts are absolute, not incremented per message.
    es.emit({ type: 'progress', sessionId: 's-1', done: 7, total: 10, failures: 1 });
    expect(within(card).getByTestId('live-session-count')).toHaveTextContent('7 / 10');

    // Malformed messages are ignored.
    act(() => es.onmessage?.(new MessageEvent('message', { data: 'not json' })));

    es.emit({ type: 'completed', sessionId: 's-1', done: 10, total: 10, failures: 2 });
    expect(within(card).getByTestId('live-session-count')).toHaveTextContent('10 / 10');
    expect(within(card).getByText('COMPLETED')).toBeInTheDocument();
    expect(within(card).getByText('2 failures')).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0][0]).toMatchObject({ sessionId: 's-1', status: 'COMPLETED' });

    // A late progress event does not flip the session back to RUNNING.
    es.emit({ type: 'progress', sessionId: 's-1', done: 10, total: 10, failures: 2 });
    expect(within(card).getByText('COMPLETED')).toBeInTheDocument();

    unmount();
    expect(es.close).toHaveBeenCalled();
  });

  it('reconnects with exponential backoff after the stream errors', () => {
    vi.useFakeTimers();
    const { unmount } = render(<LiveSessions />);
    expect(MockEventSource.instances).toHaveLength(1);

    MockEventSource.latest().fail();
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(screen.getByTestId('live-connection')).toHaveTextContent('retrying in 1s');

    act(() => vi.advanceTimersByTime(1000));
    expect(MockEventSource.instances).toHaveLength(2);

    MockEventSource.latest().fail();
    expect(screen.getByTestId('live-connection')).toHaveTextContent('retrying in 2s');
    act(() => vi.advanceTimersByTime(1999));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockEventSource.instances).toHaveLength(3);

    // A successful open resets the backoff.
    MockEventSource.latest().open();
    MockEventSource.latest().fail();
    expect(screen.getByTestId('live-connection')).toHaveTextContent('retrying in 1s');

    // No reconnect after unmount.
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockEventSource.instances).toHaveLength(3);
  });
});

describe('PromiseTrends component', () => {
  const trends: PromiseTrend[] = [
    {
      promiseId: 'no-double-charges',
      description: 'A customer is never charged twice',
      severity: 'CRITICAL',
      points: [
        { sessionId: 'session-new-000000', completedAt: T0 + 60_000, runs: 200, failedRuns: 10, failRate: 0.05 },
        { sessionId: 'session-old-000000', completedAt: T0, runs: 100, failedRuns: 0, failRate: 0 },
      ],
    },
  ];

  it('renders loading skeleton', () => {
    const { container } = render(<PromiseTrends trends={[]} isLoading />);
    expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders empty state', () => {
    render(<PromiseTrends trends={[]} />);
    expect(screen.getByText('No promises evaluated yet')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<PromiseTrends trends={[]} error={new ApiError('network', 'x', 'http://localhost:4000/api/v1/promises/trends')} />);
    expect(screen.getByText('Failed to load promise trends')).toBeInTheDocument();
    expect(screen.getByText(/Can't reach the Sibyl API at http:\/\/localhost:4000/)).toBeInTheDocument();
  });

  it('renders fail rate per promise per session', () => {
    render(<PromiseTrends trends={trends} />);
    const card = screen.getByTestId('trend-card-no-double-charges');
    expect(within(card).getByText('A customer is never charged twice')).toBeInTheDocument();
    expect(within(card).getByText('3.3%')).toBeInTheDocument();
    expect(within(card).getByText('10/300 runs')).toBeInTheDocument();
  });
});

describe('API client', () => {
  it('times out slow requests with a typed error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }),
      ),
    );
    const err = await apiGet('/api/health', undefined, { timeoutMs: 10 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('timeout');
    expect((err as ApiError).isUnreachable).toBe(true);
  });
});

describe('Preview pages', () => {
  it('marks the marketplace as sample data and disables import', () => {
    render(<Marketplace />);
    expect(screen.getByTestId('preview-banner')).toHaveTextContent('Sample data, not connected to the API.');
    for (const button of screen.getAllByRole('button', { name: /Import to Project/ })) {
      expect(button).toBeDisabled();
    }
  });
});
