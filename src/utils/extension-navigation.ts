/** Extension navigation opens a durable tab because popup documents close after focus changes. */
export const openDashboard = (path = "/"): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create({ url: chrome.runtime.getURL(`tabs/dashboard.html#${path}`) })

/** Side-panel opening stays user-gesture initiated and falls back to the dashboard when unavailable. */
export const openSidePanelOrDashboard = async (): Promise<void> => {
  if (chrome.sidePanel !== undefined) {
    const window = await chrome.windows.getCurrent()
    if (window.id !== undefined) {
      await chrome.sidePanel.open({ windowId: window.id })
      return
    }
  }
  await openDashboard("/")
}
