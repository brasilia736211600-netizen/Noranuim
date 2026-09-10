import { MAIN_CHANNEL } from '../desktop/src/main/ipc/constants'

const DESKTOP_RELEASES_FEED_URL = 'https://github.com/nonbili/Nora-Desktop/releases.atom'

type ElectronWindow = Window & {
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, name: string, ...args: any[]) => Promise<any>
    }
  }
}

export async function fetchReleaseFeed() {
  const electron = (window as ElectronWindow).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Desktop changelog is only available inside Electron.')
  }

  const res = await electron.ipcRenderer.invoke(
    MAIN_CHANNEL,
    'fetchText',
    DESKTOP_RELEASES_FEED_URL,
    { accept: 'application/atom+xml, text/xml;q=0.9, */*;q=0.8' },
  )

  if (!res || res.status < 200 || res.status >= 300 || typeof res.body !== 'string') {
    throw new Error(`Failed to fetch changelog: ${res?.status || 'unknown'}`)
  }

  return res.body
}
