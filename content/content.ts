import { scanFormFields } from './scanner';
import { mountSidebar, mountLoadingState, mountErrorState } from './sidebar';

interface FillAssistMessage {
  type: 'TRIGGER_FILL_ASSIST';
  jobDescription: string;
  apiBaseUrl: string;
  authToken: string;
}

interface FillAssistResponse {
  answers: Record<string, string | null>;
}

chrome.runtime.onMessage.addListener(
  (msg: FillAssistMessage, _sender, sendResponse) => {
    if (msg.type !== 'TRIGGER_FILL_ASSIST') return;

    handleFillAssist(msg).then(
      () => sendResponse({ success: true }),
      (err) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
    );

    return true;
  },
);

async function handleFillAssist(msg: FillAssistMessage): Promise<void> {
  const { jobDescription, apiBaseUrl, authToken } = msg;

  const fields = scanFormFields();
  if (fields.length === 0) {
    mountErrorState(
      'No form fields detected on this page. Make sure you are on a page with input fields.',
    );
    return;
  }

  mountLoadingState('Job application form');

  try {
    const res = await fetch(`${apiBaseUrl}/api/applications/fill-assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        jobDescription,
        fields: fields.map(({ element, ...rest }) => rest),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body);
        if (parsed.message) detail = parsed.message;
      } catch {
        /* not JSON */
      }
      throw new Error(detail);
    }

    const data: FillAssistResponse = await res.json();
    mountSidebar(fields, data.answers);
  } catch (err) {
    mountErrorState(err instanceof Error ? err.message : 'Unknown error');
  }
}

// Diagnostic scan — returns field list to popup
chrome.runtime.onMessage.addListener(
  (msg: { type: 'SCAN_FIELDS' }, _sender, sendResponse) => {
    if (msg.type !== 'SCAN_FIELDS') return;

    const fields = scanFormFields();
    sendResponse({
      count: fields.length,
      fields: fields.map(({ element, ...rest }) => rest),
    });
  },
);
