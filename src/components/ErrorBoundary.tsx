import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./states/ErrorState";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="Something went wrong"
          message={this.state.error.message}
        />
      );
    }

    return this.props.children;
  }
}
