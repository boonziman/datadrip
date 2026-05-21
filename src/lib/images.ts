/**
 * Resolve a real image URL for a given entity name using Wikipedia's free
 * REST API. Heavy caching in localStorage so we only hit the network once
 * per name per browser. Returns the original (emoji) fallback if anything
 * fails — UI never blocks on this.
 */

const CACHE_KEY = 'dd:wiki-img-cache:v1';
const NEG_TTL_MS = 1000 * 60 * 60 * 24 * 7; // remember misses for a week

interface CacheEntry { url: string | null; t: number; }
type Cache = Record<string, CacheEntry>;

function loadCache(): Cache {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCache(c: Cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

function normalize(name: string) {
  return name.trim();
}
function slug(name: string) {
  return encodeURIComponent(name.replace(/\s+/g, '_'));
}

const inflight = new Map<string, Promise<string | null>>();

export function getCachedImage(name: string): string | null | undefined {
  const c = loadCache();
  const e = c[normalize(name)];
  if (!e) return undefined;
  if (e.url === null && Date.now() - e.t > NEG_TTL_MS) return undefined;
  return e.url;
}

export async function fetchEntityImage(name: string, hint?: string): Promise<string | null> {
  const key = normalize(name);
  const c = loadCache();
  if (c[key] && (c[key].url || Date.now() - c[key].t < NEG_TTL_MS)) return c[key].url;
  if (inflight.has(key)) return inflight.get(key)!;

  // Wikipedia returns a 320px thumb by default — upgrade to 640px for retina.
  const upscale = (url: string | null) => url ? url.replace(/\/\d+px-/, '/640px-') : null;

  const p = (async () => {
    // Try direct page summary first.
    const candidates = [hint || name, name].filter(Boolean) as string[];
    for (const cand of candidates) {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug(cand)}?redirect=true`);
        if (r.ok) {
          const d = await r.json();
          const url = d?.thumbnail?.source || d?.originalimage?.source || null;
          if (url) return upscale(url) as string;
        }
      } catch {}
    }
    // Fallback: search the Wikipedia API for the best match, then summary.
    try {
      const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(name)}`);
      if (r.ok) {
        const d = await r.json();
        const title = d?.query?.search?.[0]?.title;
        if (title) {
          const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug(title)}?redirect=true`);
          if (r2.ok) {
            const d2 = await r2.json();
            const url = d2?.thumbnail?.source || d2?.originalimage?.source || null;
            if (url) return upscale(url) as string;
          }
        }
      }
    } catch {}
    return null;
  })().then(url => {
    const c2 = loadCache();
    c2[key] = { url, t: Date.now() };
    saveCache(c2);
    inflight.delete(key);
    return url;
  });

  inflight.set(key, p);
  return p;
}
