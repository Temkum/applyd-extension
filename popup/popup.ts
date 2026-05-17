/**
 * Popup controller — multi-provider API key management.
 *
 * Stores: applydProvider (string) + applydApiKey (string) in chrome.storage.local.
 * The key is never sent anywhere except from background.ts to the selected provider.
 */

type Provider = 'anthropic' | 'openai' | 'deepseek' | 'gemini';

interface ProviderConfig {
  label: string;
  model: string;
  keyPrefix: string;
  keyHint: string;
}

// Mirror of background.ts PROVIDERS — kept in sync manually.
// Popup cannot import background.ts directly (different bundle).
const PROVIDERS: Record<Provider, ProviderConfig> = {
  anthropic: {
    label: 'Anthropic (Claude)',
    model: 'claude-sonnet-4-20250514',
    keyPrefix: 'sk-ant-',
    keyHint: 'sk-ant-api03-...',
  },
  openai: {
    label: 'OpenAI (GPT-4o)',
    model: 'gpt-4o',
    keyPrefix: 'sk-',
    keyHint: 'sk-proj-...',
  },
  deepseek: {
    label: 'DeepSeek',
    model: 'deepseek-chat',
    keyPrefix: 'sk-',
    keyHint: 'sk-...',
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-2.0-flash',
    keyPrefix: 'AIza',
    keyHint: 'AIzaSy...',
  },
};

const PROVIDER_ORDER: Provider[] = [
  'anthropic',
  'openai',
  'deepseek',
  'gemini',
];

// DOM refs

const viewSetup = document.getElementById('view-setup')!;
const viewMain = document.getElementById('view-main')!;

// Setup
const providerSelect = document.getElementById(
  'provider-select',
) as HTMLSelectElement;
const apiKeyInput = document.getElementById(
  'api-key-input',
) as HTMLInputElement;
const resumeInput = document.getElementById(
  'resume-input',
) as HTMLTextAreaElement;
const keyHintEl = document.getElementById('key-hint')!;
const saveKeyBtn = document.getElementById('save-key-btn') as HTMLButtonElement;
const setupError = document.getElementById('setup-error')!;

// Main
const providerBadge = document.getElementById('provider-badge')!;
const jobDesc = document.getElementById('job-desc') as HTMLTextAreaElement;
const coverLetterCheckbox = document.getElementById(
  'cover-letter-checkbox',
) as HTMLInputElement;
const fillBtn = document.getElementById('fill-btn') as HTMLButtonElement;
const scanBtn = document.getElementById('scan-btn') as HTMLButtonElement;
const changeKeyLink = document.getElementById('change-key-link')!;
const errorEl = document.getElementById('error-msg')!;
const scanResult = document.getElementById('scan-result')!;

// Init

async function init(): Promise<void> {
  // Populate provider selector
  PROVIDER_ORDER.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = PROVIDERS[id].label;
    providerSelect.appendChild(opt);
  });

  // Update placeholder when provider changes
  providerSelect.addEventListener('change', () => {
    updateKeyHint(providerSelect.value as Provider);
  });
  updateKeyHint('anthropic');

  const stored = await chrome.storage.local.get([
    'applydProvider',
    'applydApiKey',
    'applydResume',
  ]);

  // Pre-fill resume textarea from storage so the user can review/edit it
  if (stored.applydResume) {
    resumeInput.value = stored.applydResume as string;
  }

  if (stored.applydApiKey) {
    showMain((stored.applydProvider as Provider) ?? 'anthropic');
  } else {
    showSetup();
  }

  jobDesc.addEventListener('input', () => {
    fillBtn.disabled = !jobDesc.value.trim();
  });

  // Persist resume updates immediately so changes survive popup close
  resumeInput.addEventListener('change', () => {
    const text = resumeInput.value.trim();
    if (text) {
      chrome.storage.local.set({ applydResume: text });
    } else {
      chrome.storage.local.remove(['applydResume']);
    }
  });
}

function updateKeyHint(provider: Provider): void {
  apiKeyInput.placeholder = PROVIDERS[provider].keyHint;
  keyHintEl.textContent = `Starts with "${PROVIDERS[provider].keyPrefix}"`;
}

// Views

function showSetup(): void {
  viewSetup.classList.add('active');
  viewMain.classList.remove('active');
  apiKeyInput.value = '';
  setupError.textContent = '';
}

function showMain(provider: Provider): void {
  viewSetup.classList.remove('active');
  viewMain.classList.add('active');
  providerBadge.textContent = PROVIDERS[provider].label;
  fillBtn.disabled = !jobDesc.value.trim();
}

// Save key

saveKeyBtn.addEventListener('click', async () => {
  const provider = providerSelect.value as Provider;
  const key = apiKeyInput.value.trim();

  if (!key) {
    setupError.textContent = 'Please enter your API key.';
    return;
  }

  const config = PROVIDERS[provider];

  // DeepSeek and OpenAI both use 'sk-' — skip prefix check for DeepSeek
  // since its keys look identical to OpenAI keys.
  const prefixOk = provider === 'deepseek' || key.startsWith(config.keyPrefix);

  if (!prefixOk) {
    setupError.textContent = `This doesn't look like a ${config.label} key (expected prefix: ${config.keyPrefix}).`;
    return;
  }

  saveKeyBtn.disabled = true;
  saveKeyBtn.textContent = 'Saving...';
  setupError.textContent = '';

  const toStore: Record<string, string> = {
    applydProvider: provider,
    applydApiKey: key,
  };

  // Persist resume text if the user filled it in during setup
  const resumeText = resumeInput.value.trim();
  if (resumeText) {
    toStore['applydResume'] = resumeText;
  }

  await chrome.storage.local.set(toStore);

  saveKeyBtn.disabled = false;
  saveKeyBtn.textContent = 'Save Key';
  showMain(provider);
});

apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKeyBtn.click();
});

// Change key

changeKeyLink.addEventListener('click', async () => {
  await chrome.storage.local.remove(['applydApiKey', 'applydProvider']);
  jobDesc.value = '';
  errorEl.textContent = '';
  scanResult.hidden = true;
  showSetup();
});

// Generate answers

fillBtn.addEventListener('click', async () => {
  const description = jobDesc.value.trim();
  if (!description) return;

  errorEl.textContent = '';
  scanResult.hidden = true;
  fillBtn.disabled = true;
  fillBtn.textContent = 'Generating...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab found.');
    resetFillBtn();
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: 'TRIGGER_FILL_ASSIST',
      jobDescription: description,
      generateCoverLetter: coverLetterCheckbox.checked,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        showError(
          'Extension not loaded on this page. Refresh the application form page and try again.',
        );
        resetFillBtn();
        return;
      }

      if (!response?.success) {
        showError(response?.error ?? 'Unknown error');
        resetFillBtn();
        return;
      }

      resetFillBtn();
      window.close();
    },
  );
});

// Scan form

scanBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab found.');
    return;
  }

  errorEl.textContent = '';
  scanResult.hidden = true;
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning...';

  chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FIELDS' }, (response) => {
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan Current Form';

    if (chrome.runtime.lastError) {
      showError('Could not reach the page. Try refreshing it first.');
      return;
    }

    if (response?.count > 0) {
      showScanResults(response.fields);
    } else {
      showError('No form fields detected on this page.');
    }
  });
});

// Helpers

interface ScannedField {
  id: string;
  label: string;
  type: string;
  required: boolean;
}

function showScanResults(fields: ScannedField[]): void {
  const header = `<div class="scan-result-header">Found ${fields.length} field${fields.length !== 1 ? 's' : ''}</div>`;
  const items = fields
    .map(
      (f) => `
      <div class="scan-field-item">
        <span class="scan-field-label" title="${escapeHtml(f.label)}">${escapeHtml(f.label)}</span>
        <span class="scan-field-type">${escapeHtml(f.type)}${f.required ? ' *' : ''}</span>
      </div>`,
    )
    .join('');
  scanResult.innerHTML = header + items;
  scanResult.hidden = false;
}

function showError(msg: string): void {
  scanResult.hidden = true;
  errorEl.textContent = msg;
}

function resetFillBtn(): void {
  fillBtn.disabled = !jobDesc.value.trim();
  fillBtn.textContent = 'Generate Answers';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
