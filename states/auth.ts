import { UserMetadata } from '@supabase/supabase-js'
import { observable } from '@legendapp/state'
import { supabaseAuth } from '@/lib/supabase/client'

interface Store {
  loaded: boolean
  userId: string | undefined
  userEmail: string | undefined
  user: UserMetadata | undefined
  accessToken: string
  plan: string | undefined
}

export const auth$ = observable<Store>({
  loaded: false,
  userId: undefined,
  userEmail: undefined,
  user: undefined,
  accessToken: '',
  plan: undefined,
})

supabaseAuth.onAuthStateChange((event, session) => {
  auth$.assign({
    loaded: true,
    userId: session?.user.id,
    userEmail: session?.user.email,
    user: session?.user.user_metadata,
    accessToken: session?.access_token,
  })
})
