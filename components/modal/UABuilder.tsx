import { View, Pressable, ScrollView } from 'react-native'
import { NouText } from '../NouText'
import { UABuilderState } from '@/states/settings'
import { USER_AGENTS } from '@/lib/user-agents'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import clsx from 'clsx'

interface UABuilderProps {
  state: UABuilderState
  onChange: (state: UABuilderState) => void
}

export function UABuilder({ state, onChange }: UABuilderProps) {
  const update = (key: keyof UABuilderState, value: string | undefined) => {
    // Cascade reset
    if (key === 'os' && state.os !== value) {
      onChange({ os: value })
    } else if (key === 'osVersion' && state.osVersion !== value) {
      onChange({ os: state.os, osVersion: value })
    } else if (key === 'model' && state.model !== value) {
      onChange({ os: state.os, osVersion: state.osVersion, model: value })
    } else {
      onChange({ ...state, [key]: value })
    }
  }

  const osData = state.os ? USER_AGENTS[state.os as keyof typeof USER_AGENTS] : null

  return (
    <View className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-3 mb-2 border border-zinc-300 dark:border-zinc-700">
      <NouText className="font-semibold mb-2 text-sm text-zinc-500">Operating System</NouText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        {Object.entries(USER_AGENTS).map(([key, data]) => (
          <Pressable
            key={key}
            onPress={() => update('os', key)}
            className={clsx("px-3 py-1 rounded-md border mr-2", state.os === key ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}
          >
            <NouText>{data.name}</NouText>
          </Pressable>
        ))}
      </ScrollView>

      {osData && (
        <>
          <NouText className="font-semibold mb-2 text-sm text-zinc-500">Version</NouText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {osData.versions.map((v) => (
              <Pressable
                key={v}
                onPress={() => update('osVersion', v)}
                className={clsx("px-3 py-1 rounded-md border mr-2", state.osVersion === v ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}
              >
                <NouText>{v.replace(/_/g, '.')}</NouText>
              </Pressable>
            ))}
          </ScrollView>

          <NouText className="font-semibold mb-2 text-sm text-zinc-500">Brand / Model</NouText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {Object.values(osData.brands).flatMap(brand => brand.models.map(model => (
              <Pressable
                key={model}
                onPress={() => update('model', model)}
                className={clsx("px-3 py-1 rounded-md border mr-2", state.model === model ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}
              >
                <NouText>{model}</NouText>
              </Pressable>
            )))}
          </ScrollView>

          <NouText className="font-semibold mb-2 text-sm text-zinc-500">Browser Engine</NouText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            {osData.browsers.map((b) => (
              <Pressable
                key={b}
                onPress={() => update('browser', b)}
                className={clsx("px-3 py-1 rounded-md border mr-2 capitalize", state.browser === b ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-300 dark:border-zinc-700")}
              >
                <NouText>{b}</NouText>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  )
}
