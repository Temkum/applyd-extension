export interface ScannedField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'file' | 'unknown';
  options?: string[];
  placeholder?: string;
  required: boolean;
  element: HTMLElement;
}

export function scanFormFields(): ScannedField[] {
  const fields: ScannedField[] = [];
  const seen = new Set<HTMLElement>();

  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select';

  const inputs = document.querySelectorAll<HTMLElement>(selector);

  inputs.forEach((el, index) => {
    if (seen.has(el)) return;
    seen.add(el);

    const label = resolveLabel(el);
    if (!label) return;

    const type = resolveType(el);
    if (type === 'file') return;

    fields.push({
      id: el.id || el.getAttribute('name') || `field_${index}`,
      label,
      type,
      options:
        type === 'select'
          ? extractSelectOptions(el as HTMLSelectElement)
          : type === 'radio'
            ? extractRadioOptions(el as HTMLInputElement)
            : undefined,
      placeholder: (el as HTMLInputElement).placeholder?.trim() || undefined,
      required:
        el.hasAttribute('required') ||
        el.getAttribute('aria-required') === 'true',
      element: el,
    });
  });

  return fields;
}

function resolveLabel(el: HTMLElement): string {
  if (el.id) {
    const explicit = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(el.id)}"]`,
    );
    if (explicit?.textContent) return explicit.textContent.trim();
  }

  const wrapping = el.closest('label');
  if (wrapping?.textContent) return cleanLabelText(wrapping, el);

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref?.textContent) return ref.textContent.trim();
  }

  const parent = el.parentElement;
  if (parent?.textContent) {
    const text = cleanLabelText(parent, el);
    if (text.length > 0 && text.length < 150) return text;
  }

  const placeholder = (el as HTMLInputElement).placeholder?.trim();
  if (placeholder && placeholder.length < 150) return placeholder;

  return '';
}

function cleanLabelText(container: HTMLElement, el: HTMLElement): string {
  let text = container.textContent ?? '';
  if ((el as HTMLInputElement).value) {
    text = text.replace((el as HTMLInputElement).value, '');
  }
  // Remove nested input labels (e.g. radio options)
  container.querySelectorAll('label').forEach((childLabel) => {
    if (childLabel !== container) {
      text = text.replace(childLabel.textContent ?? '', '');
    }
  });
  return text.replace(/\s+/g, ' ').trim();
}

function resolveType(el: HTMLElement): ScannedField['type'] {
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return 'textarea';
  if (tag === 'SELECT') return 'select';

  const inputType = (el as HTMLInputElement).type?.toLowerCase();
  if (inputType === 'radio') return 'radio';
  if (inputType === 'checkbox') return 'checkbox';
  if (inputType === 'file') return 'file';
  if (['text', 'email', 'tel', 'url', 'number', 'search', 'date', 'month', 'week'].includes(inputType)) {
    return 'text';
  }

  return 'unknown';
}

function extractSelectOptions(el: HTMLSelectElement): string[] {
  return Array.from(el.options)
    .map((o) => o.text.trim())
    .filter((t) => t && !/^[-—–]+$/.test(t) && t.length < 200);
}

function extractRadioOptions(el: HTMLInputElement): string[] {
  const name = el.name;
  if (!name) return [];

  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(name)}"]`,
    ),
  )
    .map((r) => {
      const label = resolveLabel(r);
      return label || r.value;
    })
    .filter(Boolean);
}
