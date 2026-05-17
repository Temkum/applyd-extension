import { scanFormFields } from './scanner';
import { mountSidebar, mountLoadingState, mountErrorState } from './sidebar';

interface FillAssistBackgroundResponse {
  answers?: Record<string, string | null>;
  error?: string;
}

// Listen for TRIGGER_FILL_ASSIST from popup
chrome.runtime.onMessage.addListener(
  (msg: { type: string; jobDescription?: string }, _sender, sendResponse) => {
    if (msg.type === 'TRIGGER_FILL_ASSIST' && msg.jobDescription) {
      handleFillAssist(msg.jobDescription).then(
        () => sendResponse({ success: true }),
        (err) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }),
      );
      return true;
    }

    if (msg.type === 'SCAN_FIELDS') {
      const fields = scanFormFields();
      sendResponse({
        count: fields.length,
        fields: fields.map(({ element, ...rest }) => rest),
      });
    }
  },
);

async function handleFillAssist(jobDescription: string): Promise<void> {
  const fields = scanFormFields();

  if (fields.length === 0) {
    mountErrorState(
      'No form fields detected on this page. Make sure you are on a job application form.',
    );
    return;
  }

  mountLoadingState('Job application form');

  // Delegate API call to background service worker — it owns the API key
  const response = await chrome.runtime.sendMessage({
    type: 'FILL_ASSIST',
    jobDescription,
    fields: fields.map(({ element, ...rest }) => rest),
  }) as FillAssistBackgroundResponse;

  if (response.error) {
    mountErrorState(response.error);
    return;
  }

  if (response.answers) {
    mountSidebar(fields, response.answers);
  }
}
