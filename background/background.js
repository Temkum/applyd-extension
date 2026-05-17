(() => {
  // background/background.ts
  chrome.runtime.onMessageExternal.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type !== "APPLYD_SET_SESSION") return;
      const session = {
        token: msg.token,
        apiBaseUrl: msg.apiBaseUrl,
        userEmail: msg.userEmail,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1e3
      };
      chrome.storage.local.set({ applydSession: session }, () => {
        sendResponse({ success: true });
      });
      return true;
    }
  );
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.remove("applydSession");
  });
})();
