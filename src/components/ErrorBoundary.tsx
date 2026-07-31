import { Component, ReactNode, ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h1 className="font-heading text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground max-w-sm">
            We hit an unexpected error. Please try reloading the page — if this keeps happening, let us know.
          </p>
          <Button onClick={this.handleReload}>Reload</Button>
        </div>
      );
    }

    return this.props.children;
  }
}