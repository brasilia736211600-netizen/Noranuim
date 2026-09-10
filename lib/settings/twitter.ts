export const xHomeTimelineValues = ['for-you', 'following'] as const

export type XHomeTimeline = (typeof xHomeTimelineValues)[number]

export interface XHomeTabsSettings {
  xDefaultHomeTimeline?: XHomeTimeline
}

export interface XHomeTabsDecisionState {
  activeTimeline: XHomeTimeline | null
  tabsHidden: boolean
  shouldHideTabs: boolean
  shouldRespectDefaultTimeline: boolean
}

export interface XHomeTabsDecision {
  revealTabs: boolean
  switchTo: XHomeTimeline | null
  hideTabs: boolean
}

export const normalizeXHomeTimeline = (value: unknown): XHomeTimeline => {
  return value === 'following' ? 'following' : 'for-you'
}

export const resolveXHomeTabsDecision = (
  settings: XHomeTabsSettings,
  state: XHomeTabsDecisionState,
): XHomeTabsDecision => {
  const desiredTimeline = normalizeXHomeTimeline(settings.xDefaultHomeTimeline)

  if (state.shouldRespectDefaultTimeline && state.activeTimeline !== desiredTimeline) {
    return {
      revealTabs: state.tabsHidden,
      switchTo: desiredTimeline,
      hideTabs: false,
    }
  }

  return {
    revealTabs: false,
    switchTo: null,
    hideTabs: state.shouldHideTabs,
  }
}
