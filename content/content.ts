import { scanFormFields } from './scanner';
import { mountSidebar, mountLoadingState, mountErrorState, removeSidebar } from './sidebar';

interface FillAssistMessage {
  type: 'TRIGGER_FILL_ASSIST';
  jobId: string;
  jobTitle: string;
  apiBaseUrl: string;
  authToken: string;
}

interface FillAssistResponse {
  answers: Record<string, string | null>;
}

chrome.runtime.onMessage.addListener((msg: FillAssistMessage, _sender, sendResponse) => {
  if (msg.type !== 'TRIGGER_FILL_ASSIST') return;

  handleFillAssist(msg).then(
    () => sendResponse({ success: true }),
    (err) => sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
  );

  return true; // keep channel open for async response
});

async function handleFillAssist(msg: FillAssistMessage): Promise<void> {
  const { jobId, jobTitle, apiBaseUrl, authToken } = msg;

  const fields = scanFormFields();
  if (fields.length === 0) {
    alert('Applyd: No form fields detected on this page.');
    return;
  }

  mountLoadingState(jobTitle);

  try {
    const res = await fetch(`${apiBaseUrl}/api/applications/fill-assist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        jobId,
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
        // not JSON, use raw
      }
      throw new Error(detail);
    }

    const data: FillAssistResponse = await res.json();
    mountSidebar(fields, data.answers);
  } catch (err) {
    mountErrorState(err instanceof Error ? err.message : 'Unknown error');
  }
}

// Listen for messages from the popup requesting a field scan (diagnostic)
chrome.runtime.onMessage.addListener((msg: { type: 'SCAN_FIELDS' }, _sender, sendResponse) => {
  if (msg.type !== 'SCAN_FIELDS') return;

  const fields = scanFormFields();
  sendResponse({
    count: fields.length,
    fields: fields.map(({ element, ...rest }) => rest),
  });
});
