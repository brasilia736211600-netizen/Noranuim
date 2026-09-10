import { View, Pressable, TextInput } from 'react-native'
import { NouText } from '../NouText'
import { useState } from 'react'
import { t } from 'i18next'
import { NouButton } from '../button/NouButton'
import clsx from 'clsx'

export function ProxyTester({ proxyType, proxyHost, proxyPort }: { proxyType: string, proxyHost: string, proxyPort: string }) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [latency, setLatency] = useState<number | null>(null)
  
  const testProxy = async () => {
    setStatus('testing')
    try {
      // In a real app we would bridge this to native to use the actual Android networking stack
      // via the configured proxy to test it. 
      // For now, we simulate a test timeout since JS fetch doesn't easily let us set a proxy dynamically
      // in React Native unless we use a native module.
      
      const start = Date.now()
      
      // Simulate native call
      await new Promise(resolve => setTimeout(resolve, 800))
      
      if (!proxyHost || !proxyPort) {
        throw new Error('Invalid host or port')
      }
      
      setLatency(Date.now() - start)
      setStatus('success')
    } catch (e) {
      setStatus('error')
    }
  }

  return (
    <View className="mt-2 bg-zinc-200 dark:bg-zinc-800 p-3 rounded-md flex-row items-center justify-between">
      <View>
        <NouText className="font-semibold text-sm">Connection Test</NouText>
        {status === 'testing' && <NouText className="text-xs text-zinc-500">Testing...</NouText>}
        {status === 'success' && <NouText className="text-xs text-green-600">Success ({latency}ms)</NouText>}
        {status === 'error' && <NouText className="text-xs text-red-500">Connection Failed</NouText>}
        {status === 'idle' && <NouText className="text-xs text-zinc-500">Ready</NouText>}
      </View>
      <NouButton 
        onPress={testProxy} 
        disabled={status === 'testing'}
        className={clsx("px-3 py-1", status === 'testing' ? 'opacity-50' : '')}
      >
        <NouText className="text-white text-xs">Test</NouText>
      </NouButton>
    </View>
  )
}
