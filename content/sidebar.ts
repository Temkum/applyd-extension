import type { ScannedField } from './scanner';

interface AnswerMap {
  [fieldId: string]: string | null;
}

export function mountSidebar(fields: ScannedField[], answers: AnswerMap): void {
  removeSidebar();

  const sidebar = document.createElement('div');
  sidebar.id = 'applyd-sidebar';
  sidebar.innerHTML = buildSidebarHTML(fields, answers);
  document.body.appendChild(sidebar);

  attachListeners(sidebar, fields);
}

export function mountLoadingState(jobTitle: string): void {
  removeSidebar();

  const sidebar = document.createElement('div');
  sidebar.id = 'applyd-sidebar';
  sidebar.className = 'applyd-loading';
  sidebar.innerHTML = `
    <div class="applyd-header">
      <span>Applyd</span>
      <button id="applyd-close" aria-label="Close">✕</button>
    </div>
    <div class="applyd-loading-body">
      <div class="applyd-spinner"></div>
      <p>Generating answers for</p>
      <p class="applyd-loading-job">${escapeHtml(jobTitle)}</p>
      <p class="applyd-loading-hint">Scanning ${getFormFieldCount()} form fields...</p>
    </div>
  `;

  document.body.appendChild(sidebar);
  sidebar.querySelector('#applyd-close')?.addEventListener('click', removeSidebar);
}

export function mountErrorState(message: string): void {
  removeSidebar();

  const sidebar = document.createElement('div');
  sidebar.id = 'applyd-sidebar';
  sidebar.className = 'applyd-error';
  sidebar.innerHTML = `
    <div class="applyd-header">
      <span>Applyd</span>
      <button id="applyd-close" aria-label="Close">✕</button>
    </div>
    <div class="applyd-error-body">
      <p>Something went wrong</p>
      <p class="applyd-error-msg">${escapeHtml(message)}</p>
      <button id="applyd-retry" class="applyd-retry-btn">Retry</button>
    </div>
  `;

  document.body.appendChild(sidebar);
  sidebar.querySelector('#applyd-close')?.addEventListener('click', removeSidebar);
  // Retry is handled by the content script message listener
}

export function removeSidebar(): void {
  document.getElementById('applyd-sidebar')?.remove();
}

function buildSidebarHTML(fields: ScannedField[], answers: AnswerMap): string {
  const items = fields
    .map((field) => {
      const answer = answers[field.id];
      const isEmpty = answer === null || answer === undefined;

      let answerHtml: string;
      if (isEmpty) {
        answerHtml = `<div class="applyd-field-empty">No answer generated</div>`;
      } else {
        answerHtml = `
          <div class="applyd-field-answer">${escapeHtml(answer)}</div>
          <button class="applyd-copy-btn" data-answer="${escapeHtmlAttr(answer)}">
            Copy
          </button>
        `;
      }

      return `
        <div class="applyd-field" data-field-id="${escapeHtmlAttr(field.id)}">
          <div class="applyd-field-label">
            ${escapeHtml(field.label)}
            ${field.required ? '<span class="applyd-required" title="Required">*</span>' : ''}
            <span class="applyd-field-type">${field.type}</span>
          </div>
          ${answerHtml}
        </div>
      `;
    })
    .join('');

  const answeredCount = Object.values(answers).filter(
    (v) => v !== null && v !== undefined,
  ).length;
  const totalCount = fields.length;

  return `
    <div class="applyd-header">
      <span class="applyd-header-title">Applyd</span>
      <span class="applyd-header-count">${answeredCount}/${totalCount} answered</span>
      <button id="applyd-close" aria-label="Close">✕</button>
    </div>
    <div class="applyd-fields">${items}</div>
  `;
}

function attachListeners(sidebar: HTMLElement, fields: ScannedField[]): void {
  sidebar.querySelector('#applyd-close')?.addEventListener('click', removeSidebar);

  // Copy buttons
  sidebar.querySelectorAll<HTMLButtonElement>('.applyd-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answer = btn.dataset.answer ?? '';
      navigator.clipboard.writeText(answer).then(
        () => {
          btn.textContent = 'Copied!';
          btn.classList.add('applyd-copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('applyd-copied');
          }, 1500);
        },
        () => {
          // Fallback for insecure contexts
          fallbackCopy(answer);
          btn.textContent = 'Copied!';
          btn.classList.add('applyd-copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('applyd-copied');
          }, 1500);
        },
      );
    });
  });

  // Highlight field on hover
  sidebar.querySelectorAll<HTMLElement>('.applyd-field').forEach((item) => {
    const fieldId = item.dataset.fieldId ?? '';
    const domField = fields.find((f) => f.id === fieldId);
    if (!domField) return;

    item.addEventListener('mouseenter', () => {
      domField.element.classList.add('applyd-highlight');
      domField.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    item.addEventListener('mouseleave', () => {
      domField.element.classList.remove('applyd-highlight');
    });
  });
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function getFormFieldCount(): number {
  return document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select',
  ).length;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
