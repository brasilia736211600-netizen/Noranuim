export function isAuthCallbackUrl(url: string) {
  if (url.startsWith('nora:auth')) {
    return true
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol.toLowerCase() === 'nora:' && parsed.hostname.toLowerCase() === 'auth'
  } catch {
    return false
  }
}
