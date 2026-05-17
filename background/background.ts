interface StoredSession {
  token: string;
  apiBaseUrl: string;
  userEmail: string;
  expiresAt: number;
}

// The web app calls this after login to sync the user's session token
// to the extension. The token is sent as Authorization: Bearer <token>
// on API calls from any origin.
chrome.runtime.onMessageExternal.addListener(
  (
    msg: {
      type: 'APPLYD_SET_SESSION';
      token: string;
      apiBaseUrl: string;
      userEmail: string;
    },
    _sender,
    sendResponse,
  ) => {
    if (msg.type !== 'APPLYD_SET_SESSION') return;

    const session: StoredSession = {
      token: msg.token,
      apiBaseUrl: msg.apiBaseUrl,
      userEmail: msg.userEmail,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    chrome.storage.local.set({ applydSession: session }, () => {
      sendResponse({ success: true });
    });

    return true;
  },
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('applydSession');
});
