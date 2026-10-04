// YouTube videos show a thumbnail until play is pressed, then swap in the
// player (youtube-nocookie.com), so YouTube isn't contacted, and sets no
// cookies, for visitors who don't watch.
export function initVideos() {
  document.querySelectorAll('[data-youtube]').forEach((button) => {
    button.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.youtube}?autoplay=1`;
      frame.title = button.dataset.title || 'YouTube video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.className = 'band-video__frame';
      button.replaceWith(frame);
    });
  });
}
