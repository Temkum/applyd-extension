(() => {
  // content/scanner.ts
  function scanFormFields() {
    const fields = [];
    const seen = /* @__PURE__ */ new Set();
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select';
    const inputs = document.querySelectorAll(selector);
    inputs.forEach((el, index) => {
      if (seen.has(el)) return;
      seen.add(el);
      const label = resolveLabel(el);
      if (!label) return;
      const type = resolveType(el);
      if (type === "file") return;
      fields.push({
        id: el.id || el.getAttribute("name") || `field_${index}`,
        label,
        type,
        options: type === "select" ? extractSelectOptions(el) : type === "radio" ? extractRadioOptions(el) : void 0,
        placeholder: el.placeholder?.trim() || void 0,
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        element: el
      });
    });
    return fields;
  }
  function resolveLabel(el) {
    if (el.id) {
      const explicit = document.querySelector(
        `label[for="${CSS.escape(el.id)}"]`
      );
      if (explicit?.textContent) return explicit.textContent.trim();
    }
    const wrapping = el.closest("label");
    if (wrapping?.textContent) return cleanLabelText(wrapping, el);
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref?.textContent) return ref.textContent.trim();
    }
    const parent = el.parentElement;
    if (parent?.textContent) {
      const text = cleanLabelText(parent, el);
      if (text.length > 0 && text.length < 150) return text;
    }
    const placeholder = el.placeholder?.trim();
    if (placeholder && placeholder.length < 150) return placeholder;
    return "";
  }
  function cleanLabelText(container, el) {
    let text = container.textContent ?? "";
    if (el.value) {
      text = text.replace(el.value, "");
    }
    container.querySelectorAll("label").forEach((childLabel) => {
      if (childLabel !== container) {
        text = text.replace(childLabel.textContent ?? "", "");
      }
    });
    return text.replace(/\s+/g, " ").trim();
  }
  function resolveType(el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA") return "textarea";
    if (tag === "SELECT") return "select";
    const inputType = el.type?.toLowerCase();
    if (inputType === "radio") return "radio";
    if (inputType === "checkbox") return "checkbox";
    if (inputType === "file") return "file";
    if (["text", "email", "tel", "url", "number", "search", "date", "month", "week"].includes(inputType)) {
      return "text";
    }
    return "unknown";
  }
  function extractSelectOptions(el) {
    return Array.from(el.options).map((o) => o.text.trim()).filter((t) => t && !/^[-—–]+$/.test(t) && t.length < 200);
  }
  function extractRadioOptions(el) {
    const name = el.name;
    if (!name) return [];
    return Array.from(
      document.querySelectorAll(
        `input[type="radio"][name="${CSS.escape(name)}"]`
      )
    ).map((r) => {
      const label = resolveLabel(r);
      return label || r.value;
    }).filter(Boolean);
  }

  // content/sidebar.ts
  function mountSidebar(fields, answers) {
    removeSidebar();
    const sidebar = document.createElement("div");
    sidebar.id = "applyd-sidebar";
    sidebar.innerHTML = buildSidebarHTML(fields, answers);
    document.body.appendChild(sidebar);
    attachListeners(sidebar, fields);
  }
  function mountLoadingState(jobTitle) {
    removeSidebar();
    const sidebar = document.createElement("div");
    sidebar.id = "applyd-sidebar";
    sidebar.className = "applyd-loading";
    sidebar.innerHTML = `
    <div class="applyd-header">
      <span>Applyd</span>
      <button id="applyd-close" aria-label="Close">\u2715</button>
    </div>
    <div class="applyd-loading-body">
      <div class="applyd-spinner"></div>
      <p>Generating answers for</p>
      <p class="applyd-loading-job">${escapeHtml(jobTitle)}</p>
      <p class="applyd-loading-hint">Scanning ${getFormFieldCount()} form fields...</p>
    </div>
  `;
    document.body.appendChild(sidebar);
    sidebar.querySelector("#applyd-close")?.addEventListener("click", removeSidebar);
  }
  function mountErrorState(message) {
    removeSidebar();
    const sidebar = document.createElement("div");
    sidebar.id = "applyd-sidebar";
    sidebar.className = "applyd-error";
    sidebar.innerHTML = `
    <div class="applyd-header">
      <span>Applyd</span>
      <button id="applyd-close" aria-label="Close">\u2715</button>
    </div>
    <div class="applyd-error-body">
      <p>Something went wrong</p>
      <p class="applyd-error-msg">${escapeHtml(message)}</p>
      <button id="applyd-retry" class="applyd-retry-btn">Retry</button>
    </div>
  `;
    document.body.appendChild(sidebar);
    sidebar.querySelector("#applyd-close")?.addEventListener("click", removeSidebar);
  }
  function removeSidebar() {
    document.getElementById("applyd-sidebar")?.remove();
  }
  function buildSidebarHTML(fields, answers) {
    const items = fields.map((field) => {
      const answer = answers[field.id];
      const isEmpty = answer === null || answer === void 0;
      let answerHtml;
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
            ${field.required ? '<span class="applyd-required" title="Required">*</span>' : ""}
            <span class="applyd-field-type">${field.type}</span>
          </div>
          ${answerHtml}
        </div>
      `;
    }).join("");
    const answeredCount = Object.values(answers).filter(
      (v) => v !== null && v !== void 0
    ).length;
    const totalCount = fields.length;
    return `
    <div class="applyd-header">
      <span class="applyd-header-title">Applyd</span>
      <span class="applyd-header-count">${answeredCount}/${totalCount} answered</span>
      <button id="applyd-close" aria-label="Close">\u2715</button>
    </div>
    <div class="applyd-fields">${items}</div>
  `;
  }
  function attachListeners(sidebar, fields) {
    sidebar.querySelector("#applyd-close")?.addEventListener("click", removeSidebar);
    sidebar.querySelectorAll(".applyd-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const answer = btn.dataset.answer ?? "";
        navigator.clipboard.writeText(answer).then(
          () => {
            btn.textContent = "Copied!";
            btn.classList.add("applyd-copied");
            setTimeout(() => {
              btn.textContent = "Copy";
              btn.classList.remove("applyd-copied");
            }, 1500);
          },
          () => {
            fallbackCopy(answer);
            btn.textContent = "Copied!";
            btn.classList.add("applyd-copied");
            setTimeout(() => {
              btn.textContent = "Copy";
              btn.classList.remove("applyd-copied");
            }, 1500);
          }
        );
      });
    });
    sidebar.querySelectorAll(".applyd-field").forEach((item) => {
      const fieldId = item.dataset.fieldId ?? "";
      const domField = fields.find((f) => f.id === fieldId);
      if (!domField) return;
      item.addEventListener("mouseenter", () => {
        domField.element.classList.add("applyd-highlight");
        domField.element.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      item.addEventListener("mouseleave", () => {
        domField.element.classList.remove("applyd-highlight");
      });
    });
  }
  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  function getFormFieldCount() {
    return document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    ).length;
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeHtmlAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // content/content.ts
  chrome.runtime.onMessage.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type !== "TRIGGER_FILL_ASSIST") return;
      handleFillAssist(msg).then(
        () => sendResponse({ success: true }),
        (err) => sendResponse({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error"
        })
      );
      return true;
    }
  );
  async function handleFillAssist(msg) {
    const { jobDescription, apiBaseUrl, authToken } = msg;
    const fields = scanFormFields();
    if (fields.length === 0) {
      mountErrorState(
        "No form fields detected on this page. Make sure you are on a page with input fields."
      );
      return;
    }
    mountLoadingState("Job application form");
    try {
      const res = await fetch(`${apiBaseUrl}/api/applications/fill-assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          jobDescription,
          fields: fields.map(({ element, ...rest }) => rest)
        })
      });
      if (!res.ok) {
        const body = await res.text();
        let detail = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.message) detail = parsed.message;
        } catch {
        }
        throw new Error(detail);
      }
      const data = await res.json();
      mountSidebar(fields, data.answers);
    } catch (err) {
      mountErrorState(err instanceof Error ? err.message : "Unknown error");
    }
  }
  chrome.runtime.onMessage.addListener(
    (msg, _sender, sendResponse) => {
      if (msg.type !== "SCAN_FIELDS") return;
      const fields = scanFormFields();
      sendResponse({
        count: fields.length,
        fields: fields.map(({ element, ...rest }) => rest)
      });
    }
  );
})();
