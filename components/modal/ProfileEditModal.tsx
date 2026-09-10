import { Pressable, TextInput, View, ScrollView } from 'react-native'
import { NouButton } from '../button/NouButton'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { ProfileProxyType, settings$, UserAgentMode, TimeMode, UABuilderState } from '@/states/settings'
import { t } from 'i18next'
import { useEffect, useRef, useState } from 'react'
import { BaseCenterModal } from './BaseCenterModal'
import { ui$ } from '@/states/ui'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import clsx from 'clsx'
import { UABuilder } from './UABuilder'
import { ProxyTester } from '../profile/ProxyTester'

const profileColors = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4'
]

export const ProfileEditModal = () => {
  const profileModalOpen = useValue(ui$.profileModalOpen)
  const editingProfileId = useValue(ui$.editingProfileId)
  const profiles = useValue(settings$.profiles)

  // Basic
  const [name, setName] = useState('')
  const [color, setColor] = useState(profileColors[0])

  // Proxy
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyType, setProxyType] = useState<ProfileProxyType>('http')
  const [proxyHost, setProxyHost] = useState('')
  const [proxyPort, setProxyPort] = useState('')

  // User Agent
  const [userAgentMode, setUserAgentMode] = useState<UserAgentMode>('default')
  const [customUserAgent, setCustomUserAgent] = useState('')
  const [uaBuilderState, setUaBuilderState] = useState<UABuilderState>({})

  // Time
  const [timeMode, setTimeMode] = useState<TimeMode>('default')
  const [timezone, setTimezone] = useState('')
  const [timezoneOffset, setTimezoneOffset] = useState('')

  const savingRef = useRef(false)

  useEffect(() => {
    if (profileModalOpen) {
      if (editingProfileId) {
        const profile = profiles.find((p) => p.id === editingProfileId)
        if (profile) {
          setName(profile.name || '')
          setColor(profile.color || profileColors[0])
          setProxyEnabled(profile.proxyEnabled || false)
          setProxyType(profile.proxyType || 'http')
          setProxyHost(profile.proxyHost || '')
          setProxyPort(profile.proxyPort || '')
          setUserAgentMode(profile.userAgentMode || 'default')
          setCustomUserAgent(profile.customUserAgent || '')
          setUaBuilderState(profile.uaBuilderState || {})
          setTimeMode(profile.timeMode || 'default')
          setTimezone(profile.timezone || '')
          setTimezoneOffset(profile.timezoneOffset !== undefined ? profile.timezoneOffset.toString() : '0')
        }
      } else {
        setName('')
        setColor(profileColors[0])
        setProxyEnabled(false)
        setProxyType('http')
        setProxyHost('')
        setProxyPort('')
        setUserAgentMode('default')
        setCustomUserAgent('')
        setUaBuilderState({})
        setTimeMode('default')
        setTimezone('')
        setTimezoneOffset('0')
        ui$.createdProfileId.set(null)
      }
    }
  }, [profileModalOpen, editingProfileId])

  const handleSave = () => {
    const trimmedName = name.trim()
    if (!trimmedName || savingRef.current) return
    savingRef.current = true

    if (editingProfileId) {
      const index = settings$.profiles.get().findIndex((p) => p.id === editingProfileId)
      if (index !== -1) {
        settings$.profiles[index].assign({
          name: trimmedName,
          color,
          proxyEnabled,
          proxyType,
          proxyHost,
          proxyPort,
          userAgentMode,
          customUserAgent,
          uaBuilderState,
          timeMode,
          timezone,
          timezoneOffset: parseInt(timezoneOffset, 10) || 0
        })
      }
    } else {
      const createdId = settings$.addProfile(trimmedName, color)
      if (createdId) {
        const index = settings$.profiles.get().findIndex((p) => p.id === createdId)
        if (index !== -1) {
          settings$.profiles[index].assign({
            proxyEnabled,
            proxyType,
            proxyHost,
            proxyPort,
            userAgentMode,
            customUserAgent,
            uaBuilderState,
            timeMode,
            timezone,
            timezoneOffset: parseInt(timezoneOffset, 10) || 0
          })
        }
        ui$.createdProfileId.set(createdId)
      }
    }
    onClose()
  }

  const onClose = () => {
    savingRef.current = false
    ui$.assign({ profileModalOpen: false, editingProfileId: null })
  }

  const ColorPicker: React.FC<{ selected: string; onSelect: (c: string) => void }> = ({ selected, onSelect }) => (
    <View className="flex-row flex-wrap gap-2 mt-1 mb-4">
      {profileColors.map((c) => (
        <Pressable key={c} onPress={() => onSelect(c)} className="relative">
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: selected === c ? 3 : 1, borderColor: selected === c ? '#111827' : '#a1a1aa' }} />
          {selected === c && (
            <View className="absolute inset-0 items-center justify-center">
              <MaterialIcons name="check" size={14} color="#ffffff" />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  )

  if (!profileModalOpen) return null

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-[90%] max-w-[500px] bg-white dark:bg-zinc-950 rounded-xl max-h-[85vh]">
        <View className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <NouText className="text-lg font-bold">
            {editingProfileId ? t('common.edit') : t('profiles.add')} Profile
          </NouText>
        </View>
        <ScrollView className="px-4 py-4" contentContainerStyle={{ paddingBottom: 24 }}>
          <NouText className="font-semibold mb-2">Basic Info</NouText>
          <TextInput
            className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
            value={name}
            onChangeText={setName}
            placeholder={t('profiles.namePlaceholder') || 'Profile Name'}
            placeholderTextColor="#9ca3af"
          />
          <ColorPicker selected={color} onSelect={setColor} />

          <View className="my-2 h-px bg-zinc-200 dark:bg-zinc-800" />
          <NouText className="font-semibold mb-2">Proxy Settings</NouText>
          <View className="flex-row items-center mb-2">
            <Pressable
              onPress={() => setProxyEnabled(!proxyEnabled)}
              className={clsx("w-12 h-6 rounded-full justify-center px-1", proxyEnabled ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700")}
            >
              <View className={clsx("w-4 h-4 rounded-full bg-white transition-all", proxyEnabled ? "ml-auto" : "")} />
            </Pressable>
            <NouText className="ml-2">Enable Proxy</NouText>
          </View>
          {proxyEnabled && (
            <View className="pl-2 border-l-2 border-zinc-200 dark:border-zinc-700 mb-2">
              <View className="flex-row gap-2 mb-2">
                <Pressable onPress={() => setProxyType('http')} className={clsx("px-3 py-1 rounded-md border", proxyType === 'http' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300")}>
                  <NouText>HTTP</NouText>
                </Pressable>
                <Pressable onPress={() => setProxyType('socks')} className={clsx("px-3 py-1 rounded-md border", proxyType === 'socks' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300")}>
                  <NouText>SOCKS5</NouText>
                </Pressable>
              </View>
              <TextInput
                className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
                value={proxyHost}
                onChangeText={setProxyHost}
                placeholder="Proxy Host (e.g. 192.168.1.100)"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
                value={proxyPort}
                onChangeText={setProxyPort}
                placeholder="Proxy Port (e.g. 8080)"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />
              <ProxyTester proxyType={proxyType} proxyHost={proxyHost} proxyPort={proxyPort} />
            </View>
          )}

          <View className="my-2 h-px bg-zinc-200 dark:bg-zinc-800" />
          <NouText className="font-semibold mb-2">User Agent</NouText>
          <View className="flex-row gap-2 mb-2">
            <Pressable onPress={() => setUserAgentMode('default')} className={clsx("flex-1 px-2 py-1 rounded-md border items-center", userAgentMode === 'default' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Default</NouText>
            </Pressable>
            <Pressable onPress={() => setUserAgentMode('builder')} className={clsx("flex-1 px-2 py-1 rounded-md border items-center", userAgentMode === 'builder' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Builder</NouText>
            </Pressable>
            <Pressable onPress={() => setUserAgentMode('custom')} className={clsx("flex-1 px-2 py-1 rounded-md border items-center", userAgentMode === 'custom' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Custom</NouText>
            </Pressable>
          </View>
          {userAgentMode === 'custom' && (
             <TextInput
               className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
               value={customUserAgent}
               onChangeText={setCustomUserAgent}
               placeholder="Mozilla/5.0..."
               placeholderTextColor="#9ca3af"
             />
          )}
          {userAgentMode === 'builder' && (
            <UABuilder state={uaBuilderState} onChange={setUaBuilderState} />
          )}

          <View className="my-2 h-px bg-zinc-200 dark:bg-zinc-800" />
          <NouText className="font-semibold mb-2">Locale & Timezone</NouText>
          <View className="flex-row gap-2 mb-2 flex-wrap">
            <Pressable onPress={() => setTimeMode('default')} className={clsx("px-2 py-1 rounded-md border items-center", timeMode === 'default' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Default</NouText>
            </Pressable>
            <Pressable onPress={() => setTimeMode('manual')} className={clsx("px-2 py-1 rounded-md border items-center", timeMode === 'manual' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Manual</NouText>
            </Pressable>
            <Pressable onPress={() => setTimeMode('proxy')} className={clsx("px-2 py-1 rounded-md border items-center", timeMode === 'proxy' ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}>
              <NouText>Proxy Server</NouText>
            </Pressable>
          </View>
          {timeMode === 'manual' && (
            <>
              <TextInput
                className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
                value={timezone}
                onChangeText={setTimezone}
                placeholder="IANA Timezone (e.g. America/New_York)"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                className="border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white px-3 py-2 rounded-md mb-2"
                value={timezoneOffset}
                onChangeText={setTimezoneOffset}
                placeholder="Offset in minutes (e.g. 300)"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />
            </>
          )}
        </ScrollView>
        <View className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex-row gap-4">
          <NouButton className="flex-1" variant="outline" onPress={onClose}>
            {t('buttons.cancel')}
          </NouButton>
          <NouButton className="flex-1" textClassName="text-white bg-indigo-500 rounded-lg overflow-hidden py-2" onPress={handleSave}>
            {editingProfileId ? t('common.save') : t('profiles.add')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
