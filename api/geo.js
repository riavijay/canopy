// Vercel Edge Function: the visitor's approximate location from Vercel's IP geolocation headers.
// No permission prompt, no third-party lookup. Only city-level data is returned, nothing is stored.
export const config = { runtime: 'edge' };

export default function handler(request) {
  const h = request.headers;
  const num = (k) => {
    const v = parseFloat(h.get(k));
    return Number.isFinite(v) ? v : null;
  };
  const city = h.get('x-vercel-ip-city');
  return new Response(
    JSON.stringify({
      city: city ? decodeURIComponent(city) : '',
      country: h.get('x-vercel-ip-country') || '',
      lat: num('x-vercel-ip-latitude'),
      lon: num('x-vercel-ip-longitude'),
    }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
  );
}
