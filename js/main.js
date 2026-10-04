import { initConsent } from './modules/consent.js';
import { initHeader } from './modules/header.js';
import { initGigs } from './modules/gigs.js';
import { initVideos } from './modules/videos.js';

// Header/footer are composed at build time by Astro, so these can safely
// query the DOM straight away.
initConsent();
initHeader();
initGigs();
initVideos();
