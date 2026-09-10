import { useEffect } from 'react'
import { observe } from '@legendapp/state'
import { ui$ } from '@/states/ui'
import { tabs$ } from '@/states/tabs'
import { settings$ } from '@/states/settings'
import { NoraViewModule } from '@/modules/nora-view'

// The AppObserver sits at the root and watches for active tab changes
// to dispatch global proxy configurations immediately.
export function AppObserver() {
  useEffect(() => {
    const unsub = observe(() => {
      const activeTabId = ui$.activeTabId.get()
      const tabs = tabs$.tabs.get()
      const activeTab = tabs.find(t => t.id === activeTabId)
      
      const profileId = activeTab?.profile || 'default'
      const profiles = settings$.profiles.get()
      const profile = profiles.find(p => p.id === profileId)
      
      if (profile && profile.proxyEnabled) {
        // Dispatch to native
        if (NoraViewModule && NoraViewModule.setProxyOverride) {
          NoraViewModule.setProxyOverride(
            profile.proxyType || 'http',
            profile.proxyHost || '',
            profile.proxyPort || ''
          )
        }
      } else {
        if (NoraViewModule && NoraViewModule.clearProxyOverride) {
          NoraViewModule.clearProxyOverride()
        }
      }
    })
    
    return () => unsub()
  }, [])
  
  return null
}
