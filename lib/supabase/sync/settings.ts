import { syncState, when } from '@legendapp/state'
import { normalizeSettings, Settings, settings$ } from '@/states/settings'
import { ResourceSyncMeta, syncMeta$ } from '@/states/sync-meta'
import { BaseSyncer } from './base'

type ProfileSecretFields = Pick<Settings['profiles'][number], 'proxyUsername' | 'proxyPassword' | 'proxyPacUrl'>

const stripProfileSecrets = (value: Settings): Settings => ({
  ...value,
  profiles: value.profiles.map(({ proxyUsername: _proxyUsername, proxyPassword: _proxyPassword, proxyPacUrl: _proxyPacUrl, ...profile }) => profile),
})

const preserveProfileSecrets = (remote: Settings): Settings => {
  const localSecrets = new Map(
    settings$.profiles.get().map((profile) => [
      profile.id,
      {
        proxyUsername: profile.proxyUsername,
        proxyPassword: profile.proxyPassword,
        proxyPacUrl: profile.proxyPacUrl,
      } satisfies ProfileSecretFields,
    ]),
  )

  return {
    ...remote,
    profiles: remote.profiles.map((profile) => ({
      ...profile,
      ...localSecrets.get(profile.id),
    })),
  }
}

class SettingsSyncer extends BaseSyncer<Settings> {
  NAME = 'settings'
  TABLE_NAME = 'settings'
  pushWhenRemoteMissing = true

  isPersistLoaded = () => when(syncState(settings$).isPersistLoaded)

  getValue() {
    // siteZoom and profile proxy credentials are device-local; never push them to the remote.
    const { siteZoom: _siteZoom, ...rest } = settings$.get()
    return stripProfileSecrets(rest as unknown as Settings)
  }

  setValue(value: Settings) {
    // Preserve device-local siteZoom and profile proxy credentials when applying remote settings.
    const siteZoom = settings$.siteZoom.get()
    settings$.assign(normalizeSettings({ ...preserveProfileSecrets(value), siteZoom }))
  }

  hasMeaningfulLocalValue() {
    return true
  }

  getMeta() {
    return syncMeta$.settings.get()
  }

  setMeta(meta: Partial<ResourceSyncMeta<Settings>>) {
    syncMeta$.settings.assign(meta)
  }
}

export const settingsSyncer = new SettingsSyncer()
