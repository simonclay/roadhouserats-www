// Hides gigs whose date has passed, so the list stays right between site
// rebuilds. A gig stays up until the end of its own day.
export function initGigs() {
  const list = document.querySelector('[data-gigs]');
  if (!list) return;

  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  list.querySelectorAll('[data-gig-date]').forEach((gig) => {
    if (gig.dataset.gigDate < today) gig.remove();
  });
  list.querySelectorAll('[data-gig-year]').forEach((year) => {
    if (!year.querySelector('[data-gig-date]')) year.remove();
  });
  if (!list.querySelector('[data-gig-date]')) {
    list.remove();
    const empty = document.querySelector('[data-gigs-empty]');
    if (empty) empty.hidden = false;
  }
}
