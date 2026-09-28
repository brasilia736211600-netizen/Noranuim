declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}

declare module '*?raw' {
  const content: string
  export default content
}

interface Window {
  noraDeeplink: (link: string) => void
  trustedTypes: TrustedTypes | undefined
}

interface TrustedTypes {
  createPolicy(policyName: string, policyOptions: TrustedTypePolicyOptions): TrustedTypePolicy
  emptyHTML: TrustedHTML
  emptyScript: TrustedScript
  emptyScriptURL: TrustedScriptURL
  isHTML(value: unknown): value is TrustedHTML
  isScript(value: unknown): value is TrustedScript
  isScriptURL(value: unknown): value is TrustedScriptURL
}

interface TrustedTypePolicyOptions {
  createHTML?: (input: string, args: unknown[]) => string
  createScript?: (input: string, args: unknown[]) => string
  createScriptURL?: (input: string, args: unknown[]) => string
}

interface TrustedTypePolicy {
  createHTML(input: string, ...args: unknown[]): TrustedHTML
  createScript(input: string, ...args: unknown[]): TrustedScript
  createScriptURL(input: string, ...args: unknown[]): TrustedScriptURL
  name: string
}

interface TrustedHTML {
  toString(): string
}

interface TrustedScript {
  toString(): string
}

interface TrustedScriptURL {
  toString(): string
}