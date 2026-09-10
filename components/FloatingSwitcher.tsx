import React, { useEffect, useState } from 'react'
import { View, Pressable, Dimensions } from 'react-native'
import { PanGestureHandler } from 'react-native-gesture-handler'
import Animated, { useAnimatedGestureHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { ui$ } from '@/states/ui'
import { NouText } from './NouText'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { tabs$ } from '@/states/tabs'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const WIDGET_SIZE = 48

export function FloatingSwitcher() {
  const activeTabId = useValue(ui$.activeTabId)
  const tabs = useValue(tabs$.tabs)
  const profiles = useValue(settings$.profiles)
  
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentProfile = profiles.find(p => p.id === (activeTab?.profile || 'default'))
  
  const translateX = useSharedValue(SCREEN_WIDTH - WIDGET_SIZE - 16)
  const translateY = useSharedValue(SCREEN_HEIGHT - WIDGET_SIZE - 100)
  
  const [expanded, setExpanded] = useState(false)

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: any) => {
      ctx.startX = translateX.value
      ctx.startY = translateY.value
    },
    onActive: (event, ctx: any) => {
      translateX.value = ctx.startX + event.translationX
      translateY.value = ctx.startY + event.translationY
    },
    onEnd: () => {
      // Snap to bounds
      if (translateX.value < 16) translateX.value = withSpring(16)
      if (translateX.value > SCREEN_WIDTH - WIDGET_SIZE - 16) translateX.value = withSpring(SCREEN_WIDTH - WIDGET_SIZE - 16)
      if (translateY.value < 50) translateY.value = withSpring(50)
      if (translateY.value > SCREEN_HEIGHT - WIDGET_SIZE - 50) translateY.value = withSpring(SCREEN_HEIGHT - WIDGET_SIZE - 50)
    }
  })

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value }
    ]
  }))

  if (!activeTab || !currentProfile) return null

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={[style, { position: 'absolute', zIndex: 999 }]}>
        <View className="relative">
          {expanded && (
            <View className="absolute bottom-full mb-2 right-0 bg-white dark:bg-zinc-900 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 p-2 w-48">
              <NouText className="font-bold text-xs text-zinc-500 mb-2 px-2">Switch Profile (Current Tab)</NouText>
              {profiles.map(p => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    const tabIndex = tabs$.tabs.get().findIndex(t => t.id === activeTabId)
                    if (tabIndex !== -1) {
                      tabs$.tabs[tabIndex].profile.set(p.id)
                    }
                    setExpanded(false)
                  }}
                  className="flex-row items-center py-2 px-2 rounded-lg active:bg-zinc-100 dark:active:bg-zinc-800"
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.color || '#ccc', marginRight: 8 }} />
                  <NouText className="flex-1" numberOfLines={1}>{p.name}</NouText>
                  {p.id === currentProfile.id && <MaterialIcons name="check" size={16} color="#6366f1" />}
                </Pressable>
              ))}
            </View>
          )}
          
          <Pressable
            onPress={() => setExpanded(!expanded)}
            style={{ width: WIDGET_SIZE, height: WIDGET_SIZE, borderRadius: WIDGET_SIZE / 2, backgroundColor: currentProfile.color || '#6366f1' }}
            className="items-center justify-center shadow-lg border-2 border-white dark:border-zinc-950"
          >
            <MaterialIcons name="account-circle" size={24} color="#ffffff" />
          </Pressable>
        </View>
      </Animated.View>
    </PanGestureHandler>
  )
}
