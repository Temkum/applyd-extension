(() => {
  // ../applyd-extension/background/background.ts
  chrome.runtime.onMessageExternal.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type !== "APPLYD_SET_SESSION") return;
      const session = {
        authToken: msg.authToken,
        apiBaseUrl: msg.apiBaseUrl || "https://api.applyd.com",
        // Default 24h expiry unless token is JWT and we can decode it
        expiresAt: Date.now() + 24 * 60 * 60 * 1e3
      };
      chrome.storage.local.set({ applydSession: session }, () => {
        sendResponse({ success: true });
      });
      return true;
    }
  );
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "TRIGGER_FILL_ASSIST_FROM_POPUP") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, msg.payload, (result) => {
        sendResponse(result ?? { success: false, error: "No response from content script" });
      });
    });
    return true;
  });
})();
