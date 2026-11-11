// Netlify Function: fetches the business's Google reviews from the Places API (New)
// and returns a small JSON payload for the website's reviews section.
//
// Environment variables (Netlify → Site configuration → Environment variables):
//   GOOGLE_PLACES_API_KEY   API key with "Places API (New)" enabled (kept server-side, never sent to browsers)
//   GOOGLE_PLACE_ID         Your Google Business Profile's Place ID (starts with "ChIJ…")
//   GOOGLE_REVIEWS_MIN_RATING  optional, e.g. "4" to only show 4★ and 5★ reviews (default: show all)
//
// Netlify's CDN caches the response for 24 hours, so Google is called about once a day
// no matter how many people visit. That keeps usage far inside Google's free monthly allowance.

const FIELDS = ['displayName', 'rating', 'userRatingCount', 'googleMapsUri', 'reviews'].join(',');

export default async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  const minRating = Number(process.env.GOOGLE_REVIEWS_MIN_RATING || 0);

  if (!key || !placeId) {
    return json({ configured: false, reviews: [] }, 3600);
  }

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
    });
    if (!res.ok) {
      console.error('Places API error', res.status, await res.text());
      return json({ configured: true, error: true, reviews: [] }, 600);
    }
    const place = await res.json();
    const reviews = (place.reviews || [])
      .filter((r) => (r.rating || 0) >= minRating)
      .map((r) => ({
        author: r.authorAttribution?.displayName || 'Google user',
        authorUrl: r.authorAttribution?.uri || '',
        photo: r.authorAttribution?.photoUri || '',
        rating: r.rating || 0,
        text: r.text?.text || r.originalText?.text || '',
        when: r.relativePublishTimeDescription || '',
        url: r.googleMapsUri || '',
      }))
      .filter((r) => r.text);

    return json(
      {
        configured: true,
        name: place.displayName?.text || '',
        rating: place.rating || null,
        count: place.userRatingCount || 0,
        url: place.googleMapsUri || '',
        reviews,
      },
      86400,
    );
  } catch (err) {
    console.error('Places API request failed', err);
    return json({ configured: true, error: true, reviews: [] }, 600);
  }
};

function json(body, cdnSeconds) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers always ask the CDN; the CDN keeps one shared copy for cdnSeconds.
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdnSeconds}, stale-while-revalidate=604800`,
    },
  });
}

export const config = { path: '/api/google-reviews' };
