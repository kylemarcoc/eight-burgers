import { Component, type ReactNode } from 'react';

export type ErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private readonly handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback(this.handleReset)
        : this.props.fallback;
    }
    return this.props.children;
  }
}
