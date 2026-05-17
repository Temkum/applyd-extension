(() => {
  // popup/popup.ts
  var viewDisconnected = document.getElementById("view-disconnected");
  var viewMain = document.getElementById("view-main");
  var statusText = document.getElementById("status-text");
  var logoutLink = document.getElementById("logout-link");
  var jobDesc = document.getElementById("job-desc");
  var fillBtn = document.getElementById("fill-btn");
  var scanBtn = document.getElementById("scan-btn");
  var errorEl = document.getElementById("error-msg");
  var scanResult = document.getElementById("scan-result");
  var currentSession = null;
  async function init() {
    const stored = await chrome.storage.local.get("applydSession");
    const session = stored.applydSession;
    if (session && session.expiresAt > Date.now()) {
      currentSession = session;
      showConnected(session.userEmail);
    } else {
      if (session) {
        await chrome.storage.local.remove("applydSession");
      }
      showDisconnected();
    }
    jobDesc.addEventListener("input", () => {
      fillBtn.disabled = !jobDesc.value.trim();
    });
  }
  function showDisconnected() {
    viewDisconnected.classList.add("active");
    viewMain.classList.remove("active");
  }
  function showConnected(email) {
    viewDisconnected.classList.remove("active");
    viewMain.classList.add("active");
    statusText.textContent = email;
    fillBtn.disabled = !jobDesc.value.trim();
  }
  logoutLink.addEventListener("click", async () => {
    await chrome.storage.local.remove("applydSession");
    currentSession = null;
    jobDesc.value = "";
    fillBtn.disabled = true;
    errorEl.textContent = "";
    scanResult.hidden = true;
    showDisconnected();
  });
  fillBtn.addEventListener("click", async () => {
    const description = jobDesc.value.trim();
    if (!description || !currentSession) return;
    errorEl.textContent = "";
    scanResult.hidden = true;
    fillBtn.disabled = true;
    fillBtn.textContent = "Generating...";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError("No active tab found.");
      resetFillBtn();
      return;
    }
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: "TRIGGER_FILL_ASSIST",
        jobDescription: description,
        apiBaseUrl: currentSession.apiBaseUrl,
        authToken: currentSession.token
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(
            "Content script not loaded. Refresh the application form page and try again."
          );
          resetFillBtn();
          return;
        }
        if (!response?.success) {
          showError(response?.error ?? "Unknown error");
          resetFillBtn();
          return;
        }
        resetFillBtn();
        window.close();
      }
    );
  });
  scanBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showError("No active tab found.");
      return;
    }
    errorEl.textContent = "";
    scanResult.hidden = true;
    scanBtn.disabled = true;
    scanBtn.textContent = "Scanning...";
    chrome.tabs.sendMessage(tab.id, { type: "SCAN_FIELDS" }, (response) => {
      scanBtn.disabled = false;
      scanBtn.textContent = "Scan Current Form";
      if (chrome.runtime.lastError) {
        showError("Content script not loaded. Refresh this page and try again.");
        return;
      }
      if (response?.count > 0) {
        showScanResults(response.fields);
      } else {
        showError("No form fields detected on this page.");
      }
    });
  });
  function showScanResults(fields) {
    const header = `<div class="scan-result-header">Found ${fields.length} field${fields.length !== 1 ? "s" : ""}</div>`;
    const items = fields.map(
      (f) => `
      <div class="scan-field-item">
        <span class="scan-field-label" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <span class="scan-field-type">${escapeHtml(f.type)}${f.required ? " *" : ""}</span>
      </div>`
    ).join("");
    scanResult.innerHTML = header + items;
    scanResult.hidden = false;
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function showError(msg) {
    scanResult.hidden = true;
    errorEl.textContent = msg;
  }
  function resetFillBtn() {
    fillBtn.disabled = !jobDesc.value.trim();
    fillBtn.textContent = "Generate Answers";
  }
  init();
})();
