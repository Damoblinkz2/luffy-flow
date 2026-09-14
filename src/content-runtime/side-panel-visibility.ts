type VisibilityListener = () => void

let nativeSidePanelVisible = false
const listeners = new Set<VisibilityListener>()

/** Reads the browser-owned side-panel state for the launcher in this one content-script tab. */
export const getNativeSidePanelVisible = (): boolean => nativeSidePanelVisible

/** Lets the isolated launcher react to side-panel close/open messages without page-global state. */
export const subscribeToNativeSidePanelVisibility = (
  listener: VisibilityListener,
): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Updates content-local visibility and notifies only the mounted extension launcher. */
export const setNativeSidePanelVisible = (visible: boolean): void => {
  if (nativeSidePanelVisible === visible) return
  nativeSidePanelVisible = visible
  for (const listener of listeners) listener()
}
