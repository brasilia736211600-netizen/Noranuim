import { log } from './utils'
import { removeTrackingParams } from '@/lib/url'
import { settings$ } from '@/states/settings'

let consented = false
settings$.clipboardTrackingConsent.onChange((value) => {
  consented = !!value
})

export function interceptClipboard() {
  if (!consented) return
  const writeText = navigator.clipboard.writeText
  navigator.clipboard.writeText = async function (text) {
    const clean = removeTrackingParams(text)
    return writeText.call(this, clean || text)
  }
}
