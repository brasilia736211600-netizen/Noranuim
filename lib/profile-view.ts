import type { Tab } from '@/states/tabs'

export const getProfileViewKey = (tab: Pick<Tab, 'id' | 'profile'>) => `${tab.id}:${tab.profile || 'default'}`
