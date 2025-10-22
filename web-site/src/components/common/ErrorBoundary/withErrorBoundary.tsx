import type { ComponentType, ReactNode } from 'react'
import ErrorBoundary from './index'

const withErrorBoundary = <P extends object>(
  Component: ComponentType<P>,
  fallback?: ReactNode
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`

  return WrappedComponent
}

export default withErrorBoundary
