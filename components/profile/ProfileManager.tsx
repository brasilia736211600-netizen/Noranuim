import { View, ScrollView, TextInput, Pressable } from 'react-native'
import { NouText } from '../NouText'
import { settings$, type Profile } from '@/states/settings'
import { autoProfiles$, deleteAutoProfilesData } from '@/states/auto-profiles'
import { getDeterministicProfileColor } from '@/lib/profile'
import { BaseCenterModal } from '../modal/BaseCenterModal'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { NouMenu } from '../menu/NouMenu'
import { MaterialButton } from '../button/IconButtons'
import { t } from 'i18next'
import { confirmAction, confirmDestructiveAction } from '@/lib/alert'
import { clearProfileData } from '@/lib/profile-data'
import { showToast } from '@/lib/toast'
import { exportProfileCookiesTxt } from '@/lib/cookie-export'
import clsx from 'clsx'
import { isWeb, isIos } from '@/lib/utils'
import { NouButton } from '../button/NouButton'
import { useState, useMemo } from 'react'

const formatDate = (value: number) => {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const AUTO_PROFILE_STALE_MS = 14 * 24 * 60 * 60 * 1000

const AutoProfilesModal = () => {
  const open = useValue(ui$.autoProfilesModalOpen)
  const autoProfiles = useValue(autoProfiles$.profiles)
  const staleProfiles = autoProfiles.filter((profile) => Date.now() - profile.lastUsedAt >= AUTO_PROFILE_STALE_MS)

  if (!open) {
    return null
  }

  const onClose = () => ui$.autoProfilesModalOpen.set(false)

  const confirmDelete = (profileIds: string[], message: string) => {
    if (!profileIds.length) {
      return
    }
    confirmDestructiveAction(t('menus.delete'), message, t('menus.delete'), () => deleteAutoProfilesData(profileIds))
  }

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-full p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <NouText className="text-lg font-bold">{t('profiles.autoProfiles')}</NouText>
          <View className="flex-row items-center">
            {autoProfiles.length ? (
              <NouMenu
                trigger={
                  isWeb ? (
                    <View className="h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800">
                      <MaterialIcons name="more-vert" size={22} color="#71717a" />
                    </View>
                  ) : isIos ? (
                    'ellipsis'
                  ) : (
                    'filled.MoreVert'
                  )
                }
                items={[
                  {
                    label: t('profiles.deleteStaleAutoProfiles'),
                    disabled: !staleProfiles.length,
                    handler: () =>
                      confirmDelete(
                        staleProfiles.map((profile) => profile.id),
                        t('profiles.deleteStaleAutoProfilesConfirm', { count: staleProfiles.length }),
                      ),
                  },
                  {
                    label: t('profiles.deleteAllAutoProfiles'),
                    handler: () =>
                      confirmDelete(
                        autoProfiles.map((profile) => profile.id),
                        t('profiles.deleteAllAutoProfilesConfirm', { count: autoProfiles.length }),
                      ),
                  },
                ]}
              />
            ) : null}
            <MaterialButton name="close" onPress={onClose} />
          </View>
        </View>

        {autoProfiles.length ? (
          <ScrollView
            className="max-h-[60vh] overflow-hidden rounded-[20px] border border-zinc-300 dark:border-zinc-800"
            showsVerticalScrollIndicator={false}
          >
            {autoProfiles.map((profile, index) => (
              <View
                key={profile.id}
                className={clsx(
                  'flex-row items-center justify-between gap-3 bg-zinc-100/80 dark:bg-zinc-900/70 px-4 py-3',
                  index !== autoProfiles.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800',
                )}
              >
                <View
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: getDeterministicProfileColor(profile.site) }}
                />
                <View className="min-w-0 flex-1">
                  <NouText numberOfLines={1}>{profile.site}</NouText>
                  <NouText className="mt-1 text-xs text-zinc-500 dark:text-zinc-400" numberOfLines={1}>
                    {t('profiles.autoProfileLastUsedLabel')}: {formatDate(profile.lastUsedAt)}
                  </NouText>
                </View>
                <MaterialButton
                  name="delete-outline"
                  size={20}
                  color="#ef4444"
                  onPress={() =>
                    confirmDelete([profile.id], t('profiles.deleteAutoProfileConfirm', { site: profile.site }))
                  }
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className="rounded-[20px] border border-zinc-300 dark:border-zinc-800 px-4 py-8">
            <NouText className="text-center text-zinc-500 dark:text-zinc-400">
              {t('profiles.autoProfilesEmpty')}
            </NouText>
          </View>
        )}
      </View>
    </BaseCenterModal>
  )
}

export const ProfileManager = () => {
  const profiles = useValue(settings$.profiles)
  const autoProfiles = useValue(autoProfiles$.profiles)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<'name' | 'color' | 'custom'>('name')

  const startEdit = (profile: Profile) => {
    ui$.assign({
      profileModalOpen: true,
      editingProfileId: profile.id,
    })
  }

  const confirmClearData = (profile: Profile) => {
    confirmDestructiveAction(
      t('profiles.clearData') || 'Clear Data',
      t('profiles.clearDataConfirm', { name: profile.name }) || `Clear data for ${profile.name}?`,
      t('profiles.clearData') || 'Clear Data',
      () => {
        void clearProfileData(profile.id)
          .then(() => showToast(t('toast.profileDataCleared') || 'Data cleared'))
          .catch(() => showToast(t('toast.profileDataClearFailed') || 'Failed to clear data'))
      },
    )
  }

  const confirmDeleteProfile = (profile: Profile) => {
    confirmDestructiveAction(
      t('menus.delete') || 'Delete',
      t('profiles.deleteConfirm', { name: profile.name }) || `Delete ${profile.name}?`,
      t('menus.delete') || 'Delete',
      () => settings$.deleteProfile(profile.id),
    )
  }

  const duplicateProfile = (profile: Profile) => {
    settings$.addProfile(`${profile.name} (Copy)`, profile.color)
    showToast('Profile duplicated')
  }

  const confirmExportCookies = (profile: Profile) => {
    confirmAction(
      t('profiles.exportCookies') || 'Export Cookies',
      t('profiles.exportCookiesConfirm', { name: profile.name }) || 'Export cookies?',
      t('profiles.exportCookies') || 'Export Cookies',
      () => {
        void exportProfileCookiesTxt(profile.id, profile.name)
          .then((exported) => showToast(t(exported ? 'toast.profileCookieExported' : 'toast.profileCookieExportEmpty')))
          .catch(() => showToast(t('toast.profileCookieExportFailed')))
      },
    )
  }

  const filteredProfiles = useMemo(() => {
    let result = [...profiles]
    
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(q))
    }
    
    // Sort
    if (sortMode === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortMode === 'color') {
      result.sort((a, b) => (a.color || '').localeCompare(b.color || ''))
    }
    
    return result
  }, [profiles, searchQuery, sortMode])

  return (
    <View className="mb-4">
      <AutoProfilesModal />
      <View className="flex-row items-center justify-between mb-3">
        <NouText className="font-bold text-lg">{t('profiles.label') || 'Profiles'}</NouText>
        <Pressable onPress={() => ui$.assign({ profileModalOpen: true })}>
          <MaterialIcons name="add-circle-outline" size={24} color="#6366f1" />
        </Pressable>
      </View>
      
      <View className="flex-row items-center mb-3 bg-zinc-100 dark:bg-zinc-900 rounded-md border border-zinc-300 dark:border-zinc-800 px-3 py-1">
        <MaterialIcons name="search" size={20} color="#9ca3af" />
        <TextInput 
          className="flex-1 ml-2 text-zinc-900 dark:text-zinc-100 py-1"
          placeholder="Search profiles..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <NouMenu
          trigger={isWeb ? <MaterialButton name="sort" size={20} /> : isIos ? 'ellipsis' : 'filled.Sort'}
          items={[
            { label: 'Sort by Name', handler: () => setSortMode('name') },
            { label: 'Sort by Color', handler: () => setSortMode('color') }
          ]}
        />
      </View>

      <ScrollView className="max-h-[300px] border border-zinc-300 dark:border-zinc-800 rounded-xl">
        {filteredProfiles.length === 0 && (
          <View className="p-4 items-center">
            <NouText className="text-zinc-500">No profiles found</NouText>
          </View>
        )}
        {filteredProfiles.map((profile, index) => (
          <View
            key={profile.id}
            className={clsx(
              'bg-zinc-100/80 dark:bg-zinc-900/70 px-4 py-3',
              index !== filteredProfiles.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800'
            )}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1 pr-4">
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: profile.color }} />
                <NouText numberOfLines={1} className="flex-1 font-semibold">{profile.name}</NouText>
                {profile.isDefault && <MaterialIcons name="lock-outline" size={14} color="#9ca3af" />}
                {profile.proxyEnabled && <MaterialIcons name="vpn-lock" size={14} color="#6366f1" />}
              </View>
              <NouMenu
                trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
                items={[
                  { label: t('common.edit') || 'Edit', handler: () => startEdit(profile) },
                  { label: 'Duplicate', handler: () => duplicateProfile(profile) },
                  { label: t('profiles.exportCookies') || 'Export Cookies', handler: () => confirmExportCookies(profile) },
                  { label: t('profiles.clearData') || 'Clear Data', handler: () => confirmClearData(profile) },
                  ...(profile.isDefault ? [] : [{ label: t('menus.delete') || 'Delete', handler: () => confirmDeleteProfile(profile) }]),
                ]}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="mt-4 flex-row justify-end">
        <NouButton variant="outline" onPress={() => ui$.autoProfilesModalOpen.set(true)}>
          {t('profiles.manageAutoProfiles', { count: autoProfiles.length }) || `Manage Auto-Profiles (${autoProfiles.length})`}
        </NouButton>
      </View>
    </View>
  )
}
