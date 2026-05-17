(() => {
  // ../applyd-extension/popup/popup.ts
  var statusEl = document.getElementById("status");
  var statusText = document.getElementById("status-text");
  var jobPicker = document.getElementById("job-picker");
  var fillBtn = document.getElementById("fill-btn");
  var scanBtn = document.getElementById("scan-btn");
  var errorEl = document.getElementById("error-msg");
  var currentSession = null;
  var userJobs = [];
  async function init() {
    const stored = await chrome.storage.local.get("applydSession");
    currentSession = stored.applydSession ?? null;
    if (currentSession) {
      if (currentSession.expiresAt < Date.now()) {
        setDisconnected("Session expired. Reopen the Applyd dashboard.");
        return;
      }
      await loadJobs();
    } else {
      setDisconnected("Open a job from the Applyd dashboard first.");
    }
  }
  async function loadJobs() {
    if (!currentSession) return;
    try {
      const res = await fetch(
        `${currentSession.apiBaseUrl}/api/applications/my-jobs-for-extension`,
        {
          headers: { Authorization: `Bearer ${currentSession.authToken}` }
        }
      );
      if (!res.ok) {
        setDisconnected("Failed to load jobs. Reconnect from the dashboard.");
        return;
      }
      const data = await res.json();
      userJobs = data.jobs ?? [];
      jobPicker.innerHTML = '<option value="">Select a job...</option>';
      for (const j of userJobs) {
        const opt = document.createElement("option");
        opt.value = j.id;
        opt.textContent = `${j.company ? j.company + " \u2014 " : ""}${j.jobTitle}`;
        jobPicker.appendChild(opt);
      }
      jobPicker.disabled = false;
      fillBtn.disabled = false;
      setConnected("Ready");
    } catch {
      setDisconnected("Network error. Check your connection.");
    }
  }
  function setConnected(text) {
    statusEl.className = "status status-connected";
    statusText.textContent = text;
  }
  function setDisconnected(text) {
    statusEl.className = "status status-disconnected";
    statusText.textContent = text;
  }
  fillBtn.addEventListener("click", async () => {
    const userJobId = jobPicker.value;
    if (!userJobId || !currentSession) return;
    const job = userJobs.find((j) => j.id === userJobId);
    if (!job) return;
    errorEl.textContent = "";
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
        jobId: userJobId,
        jobTitle: `${job.company ? job.company + " \u2014 " : ""}${job.jobTitle}`,
        apiBaseUrl: currentSession.apiBaseUrl,
        authToken: currentSession.authToken
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
    chrome.tabs.sendMessage(tab.id, { type: "SCAN_FIELDS" }, (response) => {
      if (chrome.runtime.lastError) {
        showError(
          "Content script not loaded. Refresh the application form page and try again."
        );
        return;
      }
      if (response?.count !== void 0) {
        alert(`Found ${response.count} form fields on this page.`);
      } else {
        showError("No fields detected.");
      }
    });
  });
  function showError(msg) {
    errorEl.textContent = msg;
  }
  function resetFillBtn() {
    fillBtn.disabled = false;
    fillBtn.textContent = "Fill Form";
  }
  init();
})();
