interface StoredSession {
  authToken: string;
  apiBaseUrl: string;
  expiresAt: number;
}

// Listen for messages from the web app (Applyd dashboard) to store the session
chrome.runtime.onMessageExternal.addListener(
  (msg: { type: 'APPLYD_SET_SESSION'; authToken: string; apiBaseUrl: string }, _sender, sendResponse) => {
    if (msg.type !== 'APPLYD_SET_SESSION') return;

    const session: StoredSession = {
      authToken: msg.authToken,
      apiBaseUrl: msg.apiBaseUrl || 'https://api.applyd.com',
      // Default 24h expiry unless token is JWT and we can decode it
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };

    chrome.storage.local.set({ applydSession: session }, () => {
      sendResponse({ success: true });
    });

    return true;
  },
);

// Forward fill-assist trigger message to the active tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'TRIGGER_FILL_ASSIST_FROM_POPUP') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      sendResponse({ success: false, error: 'No active tab' });
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, msg.payload, (result) => {
      sendResponse(result ?? { success: false, error: 'No response from content script' });
    });
  });

  return true;
});
