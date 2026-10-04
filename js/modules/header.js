// Sticky header: darkens once the page has scrolled past the top.
export function initHeader() {
  const header = document.querySelector('[data-site-header]');
  if (!header) return;

  const onScroll = () => {
    const scrolled = (window.scrollY || document.documentElement.scrollTop || 0) > 60;
    header.classList.toggle('is-scrolled', scrolled);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
