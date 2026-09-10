export const isExternalAppUrl = (url: string) => {
  try {
    const scheme = new URL(url).protocol.replace(':', '').toLowerCase()
    return !['about', 'blob', 'data', 'file', 'http', 'https', 'javascript', 'nora'].includes(scheme)
  } catch {
    return false
  }
}
