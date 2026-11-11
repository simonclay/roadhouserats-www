// YouTube videos show a thumbnail until play is pressed, then open the player
// (youtube-nocookie.com) in a pop-up, so YouTube isn't contacted, and sets no
// cookies, for visitors who don't watch. Closes with the X, Esc or a click
// outside the video; closing removes the player so the sound stops.
export function initVideos() {
  const buttons = document.querySelectorAll('[data-youtube]');
  if (!buttons.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'band-modal';
  dialog.innerHTML = `
    <button type="button" class="band-modal__close" aria-label="Close video"></button>
    <div class="band-modal__player"></div>`;
  document.body.append(dialog);
  const player = dialog.querySelector('.band-modal__player');

  dialog.querySelector('.band-modal__close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => player.replaceChildren());

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.youtube}?autoplay=1`;
      frame.title = button.dataset.title || 'YouTube video';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.className = 'band-video__frame';
      player.replaceChildren(frame);
      dialog.showModal();
    });
  });
}
