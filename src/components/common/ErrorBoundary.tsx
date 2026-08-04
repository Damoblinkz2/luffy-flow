import { Component, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
  surface: string
}

interface ErrorBoundaryState {
  failed: boolean
}

/** Major extension surfaces fail into a recoverable screen instead of rendering a blank document. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="af-card max-w-md text-center" role="alert">
          <h1 className="text-xl font-semibold">{this.props.surface} could not render</h1>
          <p className="af-muted my-3">
            Reload the extension page. Your durable queue and records remain stored.
          </p>
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 font-medium text-primary-foreground"
            onClick={() => globalThis.location.reload()}
          >
            Reload
          </button>
        </section>
      </main>
    )
  }
}
