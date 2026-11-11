// Contact form: sends to Web3Forms without leaving the page, then shows the
// thank-you message from the CMS in place of the form. Without this script
// the form still works, using Web3Forms' own thank-you page.
export function initContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form || !form.getAttribute('action')) return;

  const status = form.querySelector('[data-form-status]');
  const thanks = document.querySelector('[data-form-thanks]');
  const button = form.querySelector('button[type="submit"]');
  const email = form.closest('section')?.querySelector('a[href^="mailto:"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button) button.disabled = true;
    if (status) { status.hidden = false; status.textContent = 'Sending…'; }

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.message || String(response.status));
      if (thanks) form.replaceWith(thanks.content.cloneNode(true));
      else if (status) status.textContent = 'Thanks, your message has been sent.';
    } catch {
      if (button) button.disabled = false;
      if (status) {
        status.textContent = email
          ? `Sorry, your message couldn’t be sent. Please try again, or email ${email.textContent}.`
          : 'Sorry, your message couldn’t be sent. Please try again.';
      }
    }
  });
}
