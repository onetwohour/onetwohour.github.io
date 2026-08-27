export interface Env {
  SUPABASE_STORAGE_ORIGIN: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-None-Match, If-Modified-Since, Content-Type",
  "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified",
};

const CACHEABLE_STATUS = new Set([200, 206, 301, 302, 304]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET, HEAD, OPTIONS",
          ...CORS_HEADERS,
        },
      });
    }

    const requestUrl = new URL(request.url);
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, env.SUPABASE_STORAGE_ORIGIN);
    const upstreamHeaders = new Headers();

    copyHeader(request.headers, upstreamHeaders, "range");
    copyHeader(request.headers, upstreamHeaders, "if-none-match");
    copyHeader(request.headers, upstreamHeaders, "if-modified-since");

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: {
          "200-299": 86400,
          "300-399": 3600,
          "404": 60,
          "500-599": 0,
        },
      },
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.delete("Set-Cookie");
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      headers.set(key, value);
    }

    if (CACHEABLE_STATUS.has(upstreamResponse.status)) {
      headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  },
};

function copyHeader(from: Headers, to: Headers, name: string): void {
  const value = from.get(name);
  if (value) to.set(name, value);
}
