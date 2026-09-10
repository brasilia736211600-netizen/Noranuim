import { describe, expect, it } from 'bun:test'
import { getProfileViewKey } from './profile-view'

describe('getProfileViewKey', () => {
  it('uses the default profile when a tab has no explicit profile', () => {
    expect(getProfileViewKey({ id: 'tab-1' })).toBe('tab-1:default')
  })

  it('changes when the tab profile changes so the view remounts into a new session store', () => {
    expect(getProfileViewKey({ id: 'tab-1', profile: 'profile-1' })).toBe('tab-1:profile-1')
    expect(getProfileViewKey({ id: 'tab-1', profile: 'profile-2' })).toBe('tab-1:profile-2')
  })
})
