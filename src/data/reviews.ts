// ─────────────────────────────────────────────────────────────
//  Customer reviews: add REAL reviews only (copied from Google,
//  Facebook, texts or emails, with the customer's permission).
//  The reviews section stays hidden until at least one is added.
// ─────────────────────────────────────────────────────────────

export interface Review {
  name: string; // e.g. "Sarah M." (first name + initial is fine)
  text: string; // their words, unedited
  rating?: 1 | 2 | 3 | 4 | 5;
  source?: string; // e.g. "Google", "Facebook"
  date?: string; // e.g. "October 2026"
}

export const reviews: Review[] = [
  // {
  //   name: 'Sarah M.',
  //   text: 'Paste the review here.',
  //   rating: 5,
  //   source: 'Google',
  //   date: 'October 2026',
  // },
];

// Optional: link to your Google reviews page, shown as "Read more reviews"
// when there are manual reviews above. (Google reviews add their own link automatically.)
export const reviewsLink = '';

// ─────────────────────────────────────────────────────────────
//  Google reviews, two ways:
//  1. Elfsight widget (below). When this is filled in it's used, and loads
//     only when a visitor scrolls near the reviews section.
//     Free Elfsight plan: 200 widget views a month, with Elfsight branding.
//  2. Leave reviewsWidget empty to use the free Google Places API function instead
//     (netlify/functions/google-reviews.mjs; setup steps in the README).
// ─────────────────────────────────────────────────────────────
export const reviewsWidget = `
<!-- Elfsight Google Reviews | Untitled Google Reviews -->
<script src="https://elfsightcdn.com/platform.js" async></script>
<div class="elfsight-app-42c06448-367b-49e7-86b3-f1ff74045a4f" data-elfsight-app-lazy></div>
`;
