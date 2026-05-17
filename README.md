# Applyd — Chrome Extension

AI-powered job application form filler. Scans form fields on any job application page, sends them to your chosen AI provider along with the job description, and generates ready-to-copy answers in a sidebar.

## Supported AI Providers

- **Anthropic** (Claude Sonnet 4)
- **OpenAI** (GPT-4o)
- **DeepSeek** (DeepSeek Chat)
- **Google Gemini** (Gemini 2.0 Flash)

## How It Works

1. Click the Applyd icon in the toolbar and enter your API key for your chosen provider.
2. Navigate to any job application form page.
3. Paste the job description into the popup, optionally toggle cover letter generation, and click **Generate Answers**.
4. A sidebar slides in showing AI-generated answers for every detected form field. Hover a field to highlight it on the page. Click **Copy** to copy an answer to your clipboard.

## Project Structure

```
applyd-extension/
├── manifest.json           # Chrome Manifest V3
├── build.js                # esbuild bundler (TS → IIFE)
├── package.json
├── background/
│   └── background.ts       # Service worker — AI API calls, prompt building
├── content/
│   └── content.ts          # Content script — form scanner, sidebar UI
├── popup/
│   ├── popup.html          # Extension popup UI
│   └── popup.ts            # Popup logic — config, triggers
├── styles/
│   └── sidebar.css         # Sidebar styles
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (rebuilds on change)
npm run watch
```

The build uses [esbuild](https://esbuild.github.io/) to bundle each TypeScript entry point into a self-contained IIFE. Source files are in the same directories as their compiled output (e.g., `popup/popup.ts` → `popup/popup.js`).

## Loading Unpacked (for development)

1. Go to `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the `applyd-extension/` directory.
4. After making changes, run `npm run build` (or `npm run watch`) and click the refresh icon on the extension card.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Store your API key and provider preference locally |
| `activeTab` | Access the current tab's form fields when you trigger a scan |
| `scripting` | Inject the content script to scan forms and render the sidebar |
| `<all_urls>` | Work on any job application site (Greenhouse, Lever, Workday, etc.) |

## Privacy

- Your API key is stored in Chrome's local storage and never leaves your browser except when calling your chosen AI provider's API directly.
- Your resume/profile text is stored locally and only sent to your AI provider as part of the generation prompt.
- No analytics, no tracking, no third-party servers. All AI calls go directly from the extension to the provider you select.
