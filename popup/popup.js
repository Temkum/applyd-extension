(() => {
  // popup/popup.ts
  var PROVIDERS = {
    anthropic: {
      label: "Anthropic (Claude)",
      model: "claude-sonnet-4-20250514",
      keyPrefix: "sk-ant-",
      keyHint: "sk-ant-api03-..."
    },
    openai: {
      label: "OpenAI (GPT-4o)",
      model: "gpt-4o",
      keyPrefix: "sk-",
      keyHint: "sk-proj-..."
    },
    deepseek: {
      label: "DeepSeek",
      model: "deepseek-chat",
      keyPrefix: "sk-",
      keyHint: "sk-..."
    },
    gemini: {
      label: "Google Gemini",
      model: "gemini-2.0-flash",
      keyPrefix: "AIza",
      keyHint: "AIzaSy..."
    }
  };
  var PROVIDER_ORDER = ["anthropic", "openai", "deepseek", "gemini"];
  var viewSetup = document.getElementById("view-setup");
  var viewMain = document.getElementById("view-main");
  var providerSelect = document.getElementById("provider-select");
  var apiKeyInput = document.getElementById("api-key-input");
  var keyHintEl = document.getElementById("key-hint");
  var saveKeyBtn = document.getElementById("save-key-btn");
  var setupError = document.getElementById("setup-error");
  var providerBadge = document.getElementById("provider-badge");
  var jobDesc = document.getElementById("job-desc");
  var fillBtn = document.getElementById("fill-btn");
  var scanBtn = document.getElementById("scan-btn");
  var changeKeyLink = document.getElementById("change-key-link");
  var errorEl = document.getElementById("error-msg");
  var scanResult = document.getElementById("scan-result");
  async function init() {
    PROVIDER_ORDER.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = PROVIDERS[id].label;
      providerSelect.appendChild(opt);
    });
    providerSelect.addEventListener("change", () => {
      updateKeyHint(providerSelect.value);
    });
    updateKeyHint("anthropic");
    const stored = await chrome.storage.local.get(["applydProvider", "applydApiKey"]);
    if (stored.applydApiKey) {
      showMain(stored.applydProvider ?? "anthropic");
    } else {
      showSetup();
    }
    jobDesc.addEventListener("input", () => {
      fillBtn.disabled = !jobDesc.value.trim();
    });
  }
  function updateKeyHint(provider) {
    apiKeyInput.placeholder = PROVIDERS[provider].keyHint;
    keyHintEl.textContent = `Starts with "${PROVIDERS[provider].keyPrefix}"`;
  }
  function showSetup() {
    viewSetup.classList.add("active");
    viewMain.classList.remove("active");
    apiKeyInput.value = "";
    setupError.textContent = "";
  }
  function showMain(provider) {
    viewSetup.classList.remove("active");
    viewMain.classList.add("active");
    providerBadge.textContent = PROVIDERS[provider].label;
    fillBtn.disabled = !jobDesc.value.trim();
  }
  saveKeyBtn.addEventListener("click", async () => {
    const provider = providerSelect.value;
    const key = apiKeyInput.value.trim();
    if (!key) {
      setupError.textContent = "Please enter your API key.";
      return;
    }
    const config = PROVIDERS[provider];
    const prefixOk = provider === "deepseek" || key.startsWith(config.keyPrefix);
    if (!prefixOk) {
      setupError.textContent = `This doesn't look like a ${config.label} key (expected prefix: ${config.keyPrefix}).`;
      return;
    }
    saveKeyBtn.disabled = true;
    saveKeyBtn.textContent = "Saving...";
    setupError.textContent = "";
    await chrome.storage.local.set({
      applydProvider: provider,
      applydApiKey: key
    });
    saveKeyBtn.disabled = false;
    saveKeyBtn.textContent = "Save Key";
    showMain(provider);
  });
  apiKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveKeyBtn.click();
  });
  changeKeyLink.addEventListener("click", async () => {
    await chrome.storage.local.remove(["applydApiKey", "applydProvider"]);
    jobDesc.value = "";
    errorEl.textContent = "";
    scanResult.hidden = true;
    showSetup();
  });
  fillBtn.addEventListener("click", async () => {
    const description = jobDesc.value.trim();
    if (!description) return;
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
      { type: "TRIGGER_FILL_ASSIST", jobDescription: description },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(
            "Extension not loaded on this page. Refresh the application form page and try again."
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
        showError("Could not reach the page. Try refreshing it first.");
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
  function showError(msg) {
    scanResult.hidden = true;
    errorEl.textContent = msg;
  }
  function resetFillBtn() {
    fillBtn.disabled = !jobDesc.value.trim();
    fillBtn.textContent = "Generate Answers";
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  init();
})();
