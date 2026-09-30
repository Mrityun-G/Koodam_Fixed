import { translateText } from './translations';

// Translates the rendered app in place, so every screen, pop-up and toast
// follows the chosen language without each component handling it.
// The English text React renders stays the source: it is remembered per
// node and put back when the language returns to English.

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

// Skip icons (their text is the icon name), code, editable fields and
// anything marked as user content (e.g. chat messages)
const SKIP_SELECTOR =
  '.material-symbols-outlined, script, style, textarea, input, [data-no-translate], [contenteditable="true"]';

// Text node -> { source, shown }
const textRecords = new WeakMap();

const shouldSkip = (element) =>
  !element || !!element.closest?.(SKIP_SELECTOR);

const translateWithSpacing = (value, language) => {
  const trimmed = value.trim();

  if (!trimmed || !/[A-Za-z]/.test(trimmed)) {
    return null;
  }

  const translated = translateText(trimmed, language);

  if (translated == null) {
    return null;
  }

  // Keep the spaces around the text so inline pieces don't run together
  const start = value.slice(0, value.indexOf(trimmed));
  const end = value.slice(value.indexOf(trimmed) + trimmed.length);

  return start + translated + end;
};

const processTextNode = (node, language) => {
  if (shouldSkip(node.parentElement)) {
    return;
  }

  const record = textRecords.get(node);
  const current = node.nodeValue;

  // React replaced our translation with new English text
  const source =
    record && current === record.shown ? record.source : current;

  const next =
    language === 'en'
      ? source
      : translateWithSpacing(source, language) ?? source;

  textRecords.set(node, { source, shown: next });

  if (current !== next) {
    node.nodeValue = next;
  }
};

const processAttributes = (element, language) => {
  if (shouldSkip(element) && element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
    return;
  }

  for (const attribute of ATTRIBUTES) {
    if (!element.hasAttribute(attribute)) {
      continue;
    }

    const storeKey = `data-i18n-${attribute}`;
    const shownKey = `data-i18n-shown-${attribute}`;
    const current = element.getAttribute(attribute);

    const source =
      element.hasAttribute(storeKey) &&
      current === element.getAttribute(shownKey)
        ? element.getAttribute(storeKey)
        : current;

    const next =
      language === 'en'
        ? source
        : translateWithSpacing(source, language) ?? source;

    element.setAttribute(storeKey, source);
    element.setAttribute(shownKey, next);

    if (current !== next) {
      element.setAttribute(attribute, next);
    }
  }
};

const processTree = (root, language) => {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root, language);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  processAttributes(root, language);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  );

  let node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      processTextNode(node, language);
    } else {
      processAttributes(node, language);
    }

    node = walker.nextNode();
  }
};

// Starts translating everything inside root. Returns a stop function.
export const startDomTranslator = (root, language) => {
  if (!root) {
    return () => {};
  }

  processTree(root, language);

  const observer = new MutationObserver((mutations) => {
    // Our own edits trigger mutations too; pause while applying them
    observer.disconnect();

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        processTextNode(mutation.target, language);
      } else if (mutation.type === 'attributes') {
        processAttributes(mutation.target, language);
      } else {
        mutation.addedNodes.forEach((node) => processTree(node, language));
      }
    }

    observe();
  });

  const observe = () =>
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES
    });

  observe();

  return () => observer.disconnect();
};
