import { describe, expect, it } from 'bun:test'
import { normalizeXHomeTimeline, resolveXHomeTabsDecision } from './twitter'

describe('normalizeXHomeTimeline', () => {
  it('defaults unknown values to for-you', () => {
    expect(normalizeXHomeTimeline(undefined)).toBe('for-you')
    expect(normalizeXHomeTimeline('anything-else')).toBe('for-you')
  })

  it('preserves following', () => {
    expect(normalizeXHomeTimeline('following')).toBe('following')
  })
})

describe('resolveXHomeTabsDecision', () => {
  it('switches to the configured timeline before hiding', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following' },
        { activeTimeline: 'for-you', tabsHidden: false, shouldHideTabs: true, shouldRespectDefaultTimeline: true },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: 'following',
      hideTabs: false,
    })
  })

  it('reveals tabs before switching if they are currently hidden', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following' },
        { activeTimeline: 'for-you', tabsHidden: true, shouldHideTabs: true, shouldRespectDefaultTimeline: true },
      ),
    ).toEqual({
      revealTabs: true,
      switchTo: 'following',
      hideTabs: false,
    })
  })

  it('hides tabs once the configured timeline is active', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following' },
        { activeTimeline: 'following', tabsHidden: false, shouldHideTabs: true, shouldRespectDefaultTimeline: true },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: null,
      hideTabs: true,
    })
  })

  it('keeps tabs visible when hiding is disabled', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'for-you' },
        { activeTimeline: 'for-you', tabsHidden: false, shouldHideTabs: false, shouldRespectDefaultTimeline: true },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: null,
      hideTabs: false,
    })
  })

  it('does not switch tabs after the default has already been applied', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following' },
        { activeTimeline: 'for-you', tabsHidden: false, shouldHideTabs: true, shouldRespectDefaultTimeline: false },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: null,
      hideTabs: true,
    })
  })
})
