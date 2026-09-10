import { builtinUserStyleIds, createDefaultBuiltinUserStyles, type UserStylesSnapshot } from '../../../lib/user-styles'
import { noraSettingsEvent, noraUserStylesEvent } from '../../nora'
import {
  normalizeXHomeTimeline,
  resolveXHomeTabsDecision,
  type XHomeTabsSettings,
  type XHomeTimeline,
} from '../../../lib/settings/twitter'

const HIDDEN_CLASS = '_nora_hidden_'
const SWITCH_RETRY_MS = 1200
const HIDE_X_HOME_TABS_STYLE_ID = builtinUserStyleIds.find((id) => id === 'hide-x-home-tabs')!
const DEFAULT_TIMELINE_APPLIED_SESSION_KEY = '_nora_x_home_timeline_applied_'

const normalizeLabel = (value?: string | null) => value?.replace(/\s+/g, ' ').trim().toLowerCase() || ''

const shouldHideHomeTabs = (snapshot?: UserStylesSnapshot | null) => {
  const builtins = snapshot?.builtins || createDefaultBuiltinUserStyles()
  return builtins[HIDE_X_HOME_TABS_STYLE_ID]?.enabled !== false
}

const getTimelineFromElement = (element: Element | null): XHomeTimeline | null => {
  if (!element) {
    return null
  }

  const label = normalizeLabel(
    element.getAttribute('aria-label') ||
      element.getAttribute('data-testid') ||
      element.textContent,
  )

  if (label.includes('for you')) {
    return 'for-you'
  }
  if (label.includes('following')) {
    return 'following'
  }
  return null
}

const isActiveTab = (element: HTMLElement) => {
  return element.getAttribute('aria-selected') === 'true'
}

const getHomeTabList = () => {
  const tabLists = document.querySelectorAll<HTMLElement>('[role="tablist"]')

  for (const tabList of tabLists) {
    const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'))
    let forYouTab: HTMLElement | null = null
    let followingTab: HTMLElement | null = null

    for (const tab of tabs) {
      const timeline = getTimelineFromElement(tab)
      if (timeline === 'for-you') {
        forYouTab = tab
      } else if (timeline === 'following') {
        followingTab = tab
      }
    }

    if (forYouTab && followingTab) {
      return {
        tabList,
        forYouTab,
        followingTab,
      }
    }
  }

  return null
}

const getActiveTimeline = (tabs: { forYouTab: HTMLElement; followingTab: HTMLElement }): XHomeTimeline | null => {
  if (isActiveTab(tabs.forYouTab)) {
    return 'for-you'
  }
  if (isActiveTab(tabs.followingTab)) {
    return 'following'
  }
  return getTimelineFromElement(document.querySelector('[role="tab"][aria-selected="true"]'))
}

const getHideTarget = (tabList: HTMLElement) => {
  return tabList.parentElement instanceof HTMLElement ? tabList.parentElement : tabList
}

const hasAppliedDefaultTimelineThisSession = () => {
  try {
    return window.sessionStorage.getItem(DEFAULT_TIMELINE_APPLIED_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const markDefaultTimelineAppliedThisSession = () => {
  try {
    window.sessionStorage.setItem(DEFAULT_TIMELINE_APPLIED_SESSION_KEY, '1')
  } catch {}
}

export function runXHomeTabsController() {
  const root = window as Window &
    typeof globalThis & {
      __noraXHomeTabsInit?: boolean
    }

  if (root.__noraXHomeTabsInit) {
    return
  }
  root.__noraXHomeTabsInit = true

  let settings = {
    xDefaultHomeTimeline: normalizeXHomeTimeline(window.Nora?.getSettings?.().xDefaultHomeTimeline),
  }
  let hideTabs = shouldHideHomeTabs(window.Nora?.getUserStyles?.())
  let scheduled = false
  let hiddenTarget: HTMLElement | null = null
  let pendingTimeline: XHomeTimeline | null = null
  let pendingAt = 0
  let shouldRespectDefaultTimeline = !hasAppliedDefaultTimelineThisSession()

  const clearHiddenTarget = () => {
    if (hiddenTarget) {
      hiddenTarget.classList.remove(HIDDEN_CLASS)
      hiddenTarget = null
    }
  }

  const setTabListHidden = (tabList: HTMLElement, hidden: boolean) => {
    const hideTarget = getHideTarget(tabList)

    if (!hidden) {
      if (hiddenTarget === hideTarget) {
        hiddenTarget = null
      }
      hideTarget.classList.remove(HIDDEN_CLASS)
      return
    }

    if (hiddenTarget && hiddenTarget !== hideTarget) {
      hiddenTarget.classList.remove(HIDDEN_CLASS)
    }
    hiddenTarget = hideTarget
    hideTarget.classList.add(HIDDEN_CLASS)
  }

  const apply = () => {
    scheduled = false

    const tabs = getHomeTabList()
    if (!tabs) {
      pendingTimeline = null
      clearHiddenTarget()
      return
    }

    const hideTarget = getHideTarget(tabs.tabList)

    const activeTimeline = getActiveTimeline(tabs)
    if (activeTimeline === settings.xDefaultHomeTimeline) {
      shouldRespectDefaultTimeline = false
      markDefaultTimelineAppliedThisSession()
    }
    const decision = resolveXHomeTabsDecision(settings, {
      activeTimeline,
      tabsHidden: hideTarget.classList.contains(HIDDEN_CLASS),
      shouldHideTabs: hideTabs,
      shouldRespectDefaultTimeline,
    })

    if (decision.revealTabs) {
      setTabListHidden(tabs.tabList, false)
    }

    if (decision.switchTo) {
      const targetTab = decision.switchTo === 'following' ? tabs.followingTab : tabs.forYouTab
      const shouldRetry =
        pendingTimeline !== decision.switchTo || Date.now() - pendingAt > SWITCH_RETRY_MS

      if (shouldRetry) {
        pendingTimeline = decision.switchTo
        pendingAt = Date.now()
        targetTab.click()
      }
      return
    }

    pendingTimeline = null
    setTabListHidden(tabs.tabList, decision.hideTabs)
  }

  const scheduleApply = () => {
    if (scheduled) {
      return
    }
    scheduled = true
    window.requestAnimationFrame(apply)
  }

  window.addEventListener(noraSettingsEvent, (event) => {
    const detail = (event as CustomEvent<XHomeTabsSettings>).detail
    settings = {
      xDefaultHomeTimeline: normalizeXHomeTimeline(detail?.xDefaultHomeTimeline),
    }
    scheduleApply()
  })

  window.addEventListener(noraUserStylesEvent, (event) => {
    hideTabs = shouldHideHomeTabs((event as CustomEvent<UserStylesSnapshot>).detail)
    scheduleApply()
  })

  if (document.body) {
    const observer = new MutationObserver(() => scheduleApply())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'class', 'aria-label'],
    })
  }

  scheduleApply()
}
