import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RunList } from '../src/app/(dashboard)/runs/components/RunList';
import { RunDetail } from '../src/app/(dashboard)/runs/components/RunDetail';
import { PromiseTrends } from '../src/app/(dashboard)/trends/components/PromiseTrends';

describe('Dashboard Views UI States', () => {
  describe('RunList Component', () => {
    const mockRuns = [
      { id: 'run-1', status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: 120 },
      { id: 'run-2', status: 'FAILED', timestamp: new Date().toISOString(), durationMs: 450 }
    ];

    it('renders loading skeleton', () => {
      const { container } = render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} isLoading={true} />);
      expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
    });

    it('renders empty state when no runs', () => {
      render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} />);
      expect(screen.getByText('No simulation runs yet')).toBeInTheDocument();
      expect(screen.getByText(/You haven't executed any simulation runs/)).toBeInTheDocument();
    });

    it('renders error state', () => {
      const retryMock = vi.fn();
      render(<RunList runs={[]} selectedRunId={null} onSelectRun={vi.fn()} error={new Error('API Down')} onRetry={retryMock} />);
      expect(screen.getByText('Failed to load runs')).toBeInTheDocument();
      expect(screen.getByText('API Down')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Retry'));
      expect(retryMock).toHaveBeenCalled();
    });

    it('renders populated list', () => {
      render(<RunList runs={mockRuns} selectedRunId="run-1" onSelectRun={vi.fn()} />);
      expect(screen.getByText('run-1')).toBeInTheDocument();
      expect(screen.getByText('run-2')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });
  });

  describe('RunDetail Component', () => {
    const mockRun = {
      id: 'run-1', status: 'FAILED', timestamp: new Date().toISOString(), environment: 'staging', assignee: 'Alice', triageStatus: 'OPEN'
    };
    const mockEvents = [{ id: 'evt-1', type: 'HTTP_REQUEST', timestamp: new Date().toISOString(), isFault: true }];

    it('renders loading skeleton', () => {
      const { container } = render(<RunDetail run={null} events={[]} isLoading={true} />);
      expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
    });

    it('renders empty/null state', () => {
      render(<RunDetail run={null} events={[]} />);
      expect(screen.getByText('Select a run to view details.')).toBeInTheDocument();
    });

    it('renders error state', () => {
      render(<RunDetail run={null} events={[]} error={new Error('Failed to fetch details')} />);
      expect(screen.getByText('Failed to load run details')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch details')).toBeInTheDocument();
    });

    it('renders populated state', () => {
      render(<RunDetail run={mockRun} events={mockEvents} />);
      expect(screen.getByText('Run run-1')).toBeInTheDocument();
      expect(screen.getByText('Environment: staging')).toBeInTheDocument();
      expect(screen.getByText('HTTP_REQUEST')).toBeInTheDocument();
    });
  });

  describe('PromiseTrends Component', () => {
    const mockTrends = [
      { id: 't1', name: 'No 500s', description: 'Zero 500s', passRate: 98, totalRuns: 1000 }
    ];

    it('renders loading skeleton', () => {
      const { container } = render(<PromiseTrends trends={[]} isLoading={true} />);
      expect(container.getElementsByClassName('animate-pulse').length).toBeGreaterThan(0);
    });

    it('renders empty state', () => {
      render(<PromiseTrends trends={[]} />);
      expect(screen.getByText('No promises evaluated yet')).toBeInTheDocument();
    });

    it('renders error state', () => {
      render(<PromiseTrends trends={[]} error={new Error('Metrics failed')} />);
      expect(screen.getByText('Failed to load promise trends')).toBeInTheDocument();
      expect(screen.getByText('Metrics failed')).toBeInTheDocument();
    });

    it('renders populated trends', () => {
      render(<PromiseTrends trends={mockTrends} />);
      expect(screen.getByText('No 500s')).toBeInTheDocument();
      expect(screen.getByText('Zero 500s')).toBeInTheDocument();
      expect(screen.getByText('98% Pass Rate')).toBeInTheDocument();
    });
  });
});
