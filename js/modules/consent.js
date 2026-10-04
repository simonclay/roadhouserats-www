// Cookie consent: a banner with Accept / Reject, remembered in the browser.
// Google Analytics, footer scripts marked "only load after cookie consent"
// (held in <template data-consent-scripts>) and the Contact page's Google Map
// only load after the visitor accepts (or, for the map, clicks "Show map").
// Rejecting later removes any Analytics cookies already set.
// See CookieBanner.astro and BaseLayout.astro.

const STORAGE_KEY = 'df-cookie-consent';

function readChoice() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function saveChoice(choice) {
  try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* private mode: ask again next visit */ }
}

let analyticsLoaded = false;
let consentScriptsLoaded = false;

// Scripts added via innerHTML/template don't run, so each <script> is
// recreated before being added to the page.
function loadConsentScripts() {
  if (consentScriptsLoaded) return;
  consentScriptsLoaded = true;
  document.querySelectorAll('template[data-consent-scripts]').forEach((template) => {
    const content = template.content.cloneNode(true);
    content.querySelectorAll('script').forEach((old) => {
      const script = document.createElement('script');
      [...old.attributes].forEach((attr) => script.setAttribute(attr.name, attr.value));
      script.text = old.textContent;
      old.replaceWith(script);
    });
    document.body.appendChild(content);
  });
}

function loadAnalytics(id) {
  if (analyticsLoaded) return;
  analyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

// Google Analytics cookies are _ga and _ga_<id>, set on the site's domain.
function removeAnalyticsCookies() {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.replace(/^www\./, '')}`];
  document.cookie.split(';').map((c) => c.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid')
    .forEach((name) => {
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
      });
    });
}

function showMaps() {
  document.querySelectorAll('iframe[data-consent-src]').forEach((frame) => {
    if (!frame.src) frame.src = frame.dataset.consentSrc;
    frame.hidden = false;
  });
  document.querySelectorAll('[data-map-placeholder]').forEach((el) => { el.hidden = true; });
}

export function initConsent() {
  // "Show map" works whether or not the site has a cookie banner.
  document.querySelectorAll('[data-map-show]').forEach((button) => {
    button.addEventListener('click', showMaps);
  });

  const configEl = document.getElementById('consent-config');
  const banner = document.querySelector('[data-consent-banner]');
  if (!configEl || !banner) return;

  const { analyticsId, liveHosts } = JSON.parse(configEl.textContent || '{}');
  const onLiveSite = liveHosts.includes(window.location.hostname);

  const apply = (choice) => {
    if (choice === 'granted') {
      showMaps();
      loadConsentScripts();
      if (analyticsId && onLiveSite) loadAnalytics(analyticsId);
    } else if (choice === 'denied') {
      removeAnalyticsCookies();
    }
  };

  const choose = (choice) => {
    const wasGranted = readChoice() === 'granted';
    saveChoice(choice);
    banner.hidden = true;
    apply(choice);
    // Scripts can't be unloaded once running, so reload to stop them.
    if (wasGranted && choice === 'denied' && (analyticsLoaded || consentScriptsLoaded)) window.location.reload();
  };

  banner.querySelectorAll('[data-consent]').forEach((button) => {
    button.addEventListener('click', () => choose(button.dataset.consent));
  });

  document.querySelectorAll('[data-consent-open]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => { banner.hidden = false; });
  });

  const choice = readChoice();
  if (choice) apply(choice);
  else banner.hidden = false;
}
