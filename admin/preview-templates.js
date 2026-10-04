/*
  Live preview templates for Sveltia CMS.

  Instead of re-creating each page in React, one generic template sends the
  draft being edited to a preview route on the Astro site
  (src/preview/render.astro), which renders it with the site's real
  components and CSS. The returned page is shown in the preview pane, and
  updated in place shortly after the editor stops typing.

  Uses Sveltia's globals (h, createClass) so there's no build step.
*/

// Where the preview routes live. On the local dev server (npm run dev) they
// come from the same site as the CMS. Everywhere else they come from the
// preview server on Cloudflare Workers; its address is shown after its first
// deploy (see DEPLOYMENT.md, "CMS live preview server").
const PREVIEW_WORKER = 'https://roadhouserats-preview.cms-tools.workers.dev'; // Set per site: see README
const PREVIEW_SERVER = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? '' : PREVIEW_WORKER;

// How long to wait after the last keystroke before re-rendering.
const DEBOUNCE_MS = 400;

// Added to every previewed page: outlines whichever editable element is
// under the pointer, so it's clear what a click will jump to.
const CLICK_TO_EDIT_CSS = `
  .cms-hover { outline: 2px solid #1098AD !important; outline-offset: 4px; border-radius: 4px; cursor: pointer; }
  .cms-hidden-note { margin: 0; padding: 18px 20px; border: 2px dashed #C3CCDD; border-radius: 12px; color: #4A5670; text-align: center; font-size: 15px; }
  .cms-flash { outline: 3px solid #3B5BDB !important; outline-offset: 4px; border-radius: 4px; transition: outline-color 0.6s ease; }
`;

/**
 * Ask Sveltia's editor to open, scroll to and focus a field. This is the
 * same message Sveltia's own built-in preview sends when a field is clicked,
 * so collapsed groups (e.g. the byline) are expanded automatically.
 * @param {string} keyPath Field name, or dotted path for nested fields.
 * @param {string} locale Sveltia's locale key ('_default' without i18n).
 */
function jumpToField(keyPath, locale) {
  window.postMessage(
    { type: 'highlight-editor-field', payload: { locale, keyPath } },
    window.location.origin,
  );
  flashEditorField(keyPath);
}

// Sveltia only scrolls to the field and focuses it, which is easy to miss
// (a toggle's focus ring is tiny), so briefly highlight the whole field too.
const FIELD_FLASH_CSS = `
  /* Drawn inside the field: Sveltia's field boxes clip anything outside. */
  @keyframes cms-field-flash {
    0%, 50% { box-shadow: inset 0 0 0 3px #3B5BDB; background-color: rgba(59, 91, 219, 0.22); }
    100% { box-shadow: inset 0 0 0 3px transparent; background-color: transparent; }
  }
  .cms-field-flash {
    border-radius: 8px;
    animation: cms-field-flash 2s ease-out;
  }
`;

function flashEditorField(keyPath) {
  if (!document.getElementById('cms-field-flash-style')) {
    const style = document.createElement('style');
    style.id = 'cms-field-flash-style';
    style.textContent = FIELD_FLASH_CSS;
    document.head.appendChild(style);
  }
  // Sveltia may first expand a collapsed group or switch panes, so look for
  // the field a few times rather than once.
  let tries = 0;
  const find = () => {
    const field = document.querySelector(
      `.content-editor .pane[data-mode="edit"] .field[data-key-path="${CSS.escape(keyPath)}"]`,
    );
    if (field) {
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.classList.remove('cms-field-flash');
      void field.offsetWidth; // restart the animation on repeat clicks
      field.classList.add('cms-field-flash');
      setTimeout(() => field.classList.remove('cms-field-flash'), 2100);
    } else if (++tries < 10) {
      setTimeout(find, 60);
    }
  };
  setTimeout(find, 60);
}

/**
 * A rendered page's <main>, parsed but not displayed, for comparing renders.
 * @param {string} html Full page HTML.
 * @returns {Element | null} Null if the page has no <main>.
 */
function mainOf(html) {
  return new DOMParser().parseFromString(html, 'text/html').querySelector('main');
}

/**
 * An element's own tag, attributes and loose text, ignoring its child
 * elements. If two elements match on this, only their children differ.
 * @param {Element} el Element.
 */
function ownSignature(el) {
  const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent);
  return `${el.cloneNode(false).outerHTML}|${text.join('\u0000')}`;
}

/**
 * Update `live` (the displayed element) from the previous render `before` to
 * the new render `after`, replacing only the innermost elements that changed.
 * Typing in one paragraph replaces just that paragraph, so nearby images and
 * everything else on the page are left alone.
 * @param {Element} live Displayed element.
 * @param {Element} before Same element from the previous render.
 * @param {Element} after Same element from the new render.
 */
function patchChildren(live, before, after) {
  [...after.children].forEach((next, i) => {
    const prev = before.children[i];
    const shown = live.children[i];
    if (prev.outerHTML === next.outerHTML) return;
    const sameShape =
      prev.children.length > 0 &&
      prev.children.length === next.children.length &&
      shown.children.length === next.children.length &&
      ownSignature(prev) === ownSignature(next);
    if (sameShape) patchChildren(shown, prev, next);
    else shown.outerHTML = next.outerHTML;
  });
}

/**
 * Build a preview template for one collection.
 * @param {string} route Preview route path, e.g. '/preview/home'.
 */
function livePreview(route) {
  return createClass({
    getInitialState() {
      return { html: '', problems: [], error: '' };
    },

    componentDidMount() {
      this.requestId = 0;
      this.scrollY = 0;
      this.lastPreviewClick = 0;
      document.addEventListener('focusin', this.onEditorFocus);
      this.refresh();
    },

    componentDidUpdate(prevProps) {
      if (prevProps.entry !== this.props.entry) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.refresh(), DEBOUNCE_MS);
      }
    },

    componentWillUnmount() {
      clearTimeout(this.timer);
      document.removeEventListener('focusin', this.onEditorFocus);
    },

    // Clicking into a field on the left scrolls the preview to the part of
    // the page it controls and flashes it. Nested fields fall back to their
    // nearest tagged parent (e.g. a list item's group).
    onEditorFocus(event) {
      // A jump from the preview also focuses the field: don't bounce back.
      if (Date.now() - this.lastPreviewClick < 1000) return;
      const field = event.target.closest && event.target.closest(
        '.content-editor .pane[data-mode="edit"] .field[data-key-path]',
      );
      const doc = this.frame && this.frame.contentDocument;
      if (!field || !doc) return;
      let keyPath = field.dataset.keyPath;
      let el = null;
      while (keyPath && !el) {
        el = doc.querySelector(`[data-cms-field="${CSS.escape(keyPath)}"]`);
        keyPath = keyPath.includes('.') ? keyPath.slice(0, keyPath.lastIndexOf('.')) : '';
      }
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('cms-flash');
      void el.offsetWidth;
      el.classList.add('cms-flash');
      setTimeout(() => el.classList.remove('cms-flash'), 900);
    },

    async refresh() {
      const { entry } = this.props;
      const id = ++this.requestId;
      const draft = {
        slug: entry.get('slug') || '',
        data: entry.get('data').toJS(),
      };

      try {
        const res = await fetch(`${PREVIEW_SERVER}${route}`, {
          method: 'POST',
          // text/plain keeps this a "simple" request, so a preview server on
          // another origin doesn't need a CORS preflight.
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) throw new Error(`Preview server replied ${res.status}`);
        const html = await res.text();
        const problems = JSON.parse(res.headers.get('X-Preview-Problems') || '[]');

        // A slower, older request finishing late mustn't overwrite a newer one.
        if (id !== this.requestId) return;

        // Once the page has loaded, update it in place rather than reloading
        // it, so the preview doesn't flash or move while someone is typing.
        if (this.patchPage(html)) {
          this.setState({ problems, error: '' });
          return;
        }

        // Otherwise (first load, or the page's shape changed), load it
        // afresh, remembering the scroll position to restore afterwards.
        const frameWindow = this.frame && this.frame.contentWindow;
        if (frameWindow && this.loaded) this.scrollY = frameWindow.scrollY;
        this.loaded = false;
        this.rendered = mainOf(html);
        this.setState({ html: this.withBase(html), problems, error: '' });
      } catch (err) {
        if (id === this.requestId) this.setState({ error: err.message });
      }
    },

    // The page is shown via srcdoc, so relative URLs (CSS, images, scripts)
    // need a base pointing at the preview server. Links open in a new tab
    // rather than navigating the preview pane away from the draft.
    withBase(html) {
      const origin = PREVIEW_SERVER || window.location.origin;
      return html.replace(
        /<head([^>]*)>/i,
        `<head$1><base href="${origin}/" target="_blank"><style>${CLICK_TO_EDIT_CSS}</style>`,
      );
    },

    onFrameLoad() {
      const frameWindow = this.frame && this.frame.contentWindow;
      if (!frameWindow) return;
      // 'instant' overrides the site's scroll-behavior: smooth, which would
      // otherwise animate all the way down from the top of the page.
      frameWindow.scrollTo({ top: this.scrollY, behavior: 'instant' });
      this.enableClickToEdit(frameWindow.document);
      this.loaded = true;
    },

    // Swap in only the parts of <main> that changed since the last render.
    // Scroll position is untouched, and unchanged parts (images especially)
    // stay exactly as they are. Returns false if it can't patch.
    patchPage(html) {
      const doc = this.loaded && this.frame && this.frame.contentDocument;
      const main = doc && doc.querySelector('main');
      const next = mainOf(html);
      const prev = this.rendered;
      if (!main || !next || !prev || main.children.length !== prev.children.length) {
        return false;
      }

      if (next.children.length === prev.children.length) {
        patchChildren(main, prev, next);
      } else {
        // A whole section appeared or disappeared.
        main.innerHTML = next.innerHTML;
      }

      this.rendered = next;
      // Icons are drawn by script from <i data-lucide> placeholders, so any
      // swapped-in section needs them drawing again.
      const lucide = doc.defaultView.lucide;
      if (lucide && lucide.createIcons) lucide.createIcons();
      return true;
    },

    // The preview route tags each editable element with data-cms-field (see
    // src/lib/cms.ts). Nested tags are fine: the innermost
    // one under the pointer wins, e.g. the byline inside the article body.
    enableClickToEdit(doc) {
      const target = (event) => event.target.closest && event.target.closest('[data-cms-field]');
      let hovered = null;

      doc.addEventListener('mouseover', (event) => {
        const el = target(event);
        if (el === hovered) return;
        if (hovered) hovered.classList.remove('cms-hover');
        hovered = el;
        if (el) el.classList.add('cms-hover');
      });

      doc.addEventListener('mouseleave', () => {
        if (hovered) hovered.classList.remove('cms-hover');
        hovered = null;
      });

      // Capture phase, so a click on an editable link (e.g. the banner
      // button) jumps to its field instead of opening the link. Links that
      // aren't editable do nothing: following one would only open a new tab
      // and take the editor away from their draft. Buttons (e.g. the menu)
      // still work.
      doc.addEventListener(
        'click',
        (event) => {
          const el = target(event);
          if (!el) {
            if (event.target.closest && event.target.closest('a[href]')) event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          this.lastPreviewClick = Date.now();
          el.classList.add('cms-flash');
          setTimeout(() => el.classList.remove('cms-flash'), 600);
          jumpToField(el.dataset.cmsField, this.props.locale || '_default');
        },
        true,
      );
    },

    render() {
      const { html, problems, error } = this.state;
      const notice = error
        ? `Live preview unavailable: ${error}`
        : problems.length
          ? `Preview only. Fill in before publishing: ${problems.join(', ')}`
          : '';

      return h(
        'div',
        { style: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#fff' } },
        notice &&
          h(
            'div',
            {
              style: {
                padding: '8px 16px',
                background: error ? '#FDE8E8' : '#FFF4D6',
                color: error ? '#7A1C1C' : '#5A3B00',
                font: '500 13px/1.4 system-ui, sans-serif',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
              },
            },
            notice,
          ),
        h('iframe', {
          ref: (el) => (this.frame = el),
          srcDoc: html,
          onLoad: this.onFrameLoad,
          title: 'Live page preview',
          style: { flex: 1, width: '100%', border: 0 },
        }),
      );
    },
  });
}

// One per Sveltia collection, or per file in the "pages" file collection.
// Each name must also be listed in TYPES in src/preview/render.astro.
['home', 'legal'].forEach((name) => {
  CMS.registerPreviewTemplate(name, livePreview(`/preview/${name}`));
});
