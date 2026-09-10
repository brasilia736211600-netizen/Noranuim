import { Href, Link } from 'expo-router'
import { openAuthSessionAsync, openBrowserAsync } from 'expo-web-browser'
import { type ComponentProps } from 'react'
import { onReceiveAuthUrl } from '@/lib/supabase/auth'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string }

export const NouLink: React.FC<Props> = ({ href, ...rest }) => {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        event.preventDefault()
        try {
          if (href.includes('/auth/')) {
            // For auth links, using openAuthSessionAsync is more robust on iOS
            // as it handles deep link redirects and automatic dismissal better.
            const result = await openAuthSessionAsync(href, 'nora:auth')
            if (result.type === 'success' && result.url) {
              await onReceiveAuthUrl(result.url)
            }
          } else {
            await openBrowserAsync(href)
          }
        } catch (error) {
          console.warn('Failed to open link', error)
        }
      }}
    />
  )
}
