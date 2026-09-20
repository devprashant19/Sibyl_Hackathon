import * as React from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "./Card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="flex flex-col items-center justify-center p-8 text-center bg-ink-2 border-ember/20">
          <div className="text-ember mb-4 bg-ember/10 p-3 rounded-full">
            <AlertCircle size={32} />
          </div>
          <h3 className="font-display text-lg text-parchment mb-2">Something went wrong</h3>
          <p className="text-sm text-muted mb-6 max-w-md">
            {this.state.error?.message || "An unexpected error occurred while loading this view."}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-ink-3 hover:bg-ink-3/80 text-parchment rounded-md text-sm font-mono transition-colors"
          >
            Try Again
          </button>
        </Card>
      );
    }

    return this.props.children;
  }
}
