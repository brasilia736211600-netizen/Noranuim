import * as React from 'react'
import { NoraViewProps } from './NoraView.types'

/** CSP nonce generated per-session for script/style injection. */
let cspNonce: string | null = null
function getCspNonce(): string {
  if (!cspNonce) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    cspNonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return cspNonce
}

/** Trusted Types policy for safe DOM sinks. */
let trustedTypesPolicy: TrustedTypePolicy | null = null
function getTrustedTypesPolicy(): TrustedTypePolicy | null {
  if (trustedTypesPolicy) return trustedTypesPolicy
  if (typeof window !== 'undefined' && window.trustedTypes?.createPolicy) {
    try {
      trustedTypesPolicy = window.trustedTypes.createPolicy('nora', {
        createHTML: (s: string) => s,
        createScript: (s: string) => s,
        createScriptURL: (s: string) => s,
      })
    } catch {}
  }
  return trustedTypesPolicy
}

export default function NoraView(props: NoraViewProps) {
  // The Electron <webview> is a DOM element that only understands lowercase string
  // attributes. Drop the native-only props (they are no-ops here and React warns about
  // boolean/camelCase attributes like `inspectable={false}` and `textZoom`).
  const { inspectable, textZoom, scrollEvents, scriptOnStart, scriptOnDocumentStart, profile, onLoad, onMessage, ...rest } = props

  // Generate CSP with nonce for inline scripts/styles injected by the app.
  const nonce = getCspNonce()
  const csp = [
    "default-src 'self' data: blob: filesystem: https:",
    "script-src 'self' 'nonce-" + nonce + "' https:",
    "style-src 'self' 'nonce-" + nonce + "' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  // @ts-expect-error webview is an Electron custom element
  return <webview {...rest} csp={csp} />
}

// Export helpers so injected scripts can use the same nonce/policy.
export { getCspNonce, getTrustedTypesPolicy }
