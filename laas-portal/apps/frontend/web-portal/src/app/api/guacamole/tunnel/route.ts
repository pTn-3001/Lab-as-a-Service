/**
 * /api/guacamole/tunnel — Next.js HTTP proxy cho Guacamole HTTP Tunnel
 *
 * NOTE: File này chỉ dùng như fallback nếu WebSocket tunnel không khả dụng.
 * Kiến trúc chính là WebSocket tunnel qua Nginx (không qua Next.js).
 *
 * Nginx đã proxy /guacamole/websocket-tunnel → Tomcat với WebSocket upgrade.
 * GuacamoleTerminal component dùng WebSocketTunnel trực tiếp qua Nginx.
 *
 * Route này chỉ giữ lại để tương thích nếu cần HTTP fallback.
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const GUACAMOLE_INTERNAL = (
  process.env.GUACAMOLE_INTERNAL_URL || 'http://localhost:8080/guacamole'
).replace(/\/$/, '');

/**
 * Parse URL proxy:
 * Input:  /api/guacamole/tunnel?base=http://host/guacamole?connect
 * Output: http://localhost:8080/guacamole/tunnel?connect
 */
function resolveUpstreamUrl(requestUrl: string): URL {
  const urlObj = new URL(requestUrl, 'http://dummy.com');

  // 'base' param có thể chứa '?command' bị dính vào
  // VD: base = "http://221.132.18.35:7300/guacamole?connect"
  let baseVal = urlObj.searchParams.get('base') || '';
  let commandParam = '';

  if (baseVal.includes('?')) {
    const qi = baseVal.indexOf('?');
    // base thật sự là phần trước '?'
    baseVal = baseVal.substring(0, qi);
    commandParam = baseVal.substring(qi + 1); // BUG FIX: lấy đúng sau qi
  }

  // Nếu không có command trong base, lấy từ query string khác
  if (!commandParam) {
    for (const [key, val] of urlObj.searchParams.entries()) {
      if (key !== 'base') {
        commandParam = val ? `${key}=${val}` : key;
        break;
      }
    }
  }

  if (!baseVal) throw new Error('Missing base URL parameter');

  // Luôn rewrite về internal address
  const upstreamUrl = new URL(`${GUACAMOLE_INTERNAL}/tunnel`);
  if (commandParam) {
    upstreamUrl.search = `?${commandParam}`;
  }

  console.log(`[GuacamoleProxy] Upstream: ${upstreamUrl} | base: ${baseVal} | cmd: ${commandParam}`);
  return upstreamUrl;
}

/**
 * Headers an toàn để forward lên Tomcat.
 * Bỏ host, origin, connection để tránh conflict.
 * GIỮ cookie nếu browser đã có JSESSIONID.
 */
function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const skipHeaders = new Set([
    'host', 'origin', 'referer', 'connection',
    'transfer-encoding', 'upgrade',
  ]);

  request.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  return headers;
}

async function handleProxy(request: NextRequest, method: 'GET' | 'POST') {
  try {
    const upstreamUrl = resolveUpstreamUrl(request.url);
    const headers = buildForwardHeaders(request);

    let requestBody: ArrayBuffer | null = null;
    if (method === 'POST') {
      requestBody = await request.arrayBuffer();
      if (requestBody.byteLength > 0) {
        headers.set('content-length', String(requestBody.byteLength));
        console.log(`[GuacamoleProxy] POST body (${requestBody.byteLength}B):`,
          new TextDecoder().decode(requestBody));
      }
    }

    console.log(`[GuacamoleProxy] ${method} → ${upstreamUrl}`);
    console.log(`[GuacamoleProxy] Headers:`, Object.fromEntries(headers.entries()));

    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: 'no-store',
      // @ts-ignore — required for streaming in Node.js
      duplex: 'half',
      ...(requestBody ? { body: requestBody } : {}),
    };

    const res = await fetch(upstreamUrl.toString(), fetchOptions);
    console.log(`[GuacamoleProxy] Tomcat responded: ${res.status}`);

    // Copy response headers, rewrite cookie paths
    const responseHeaders = new Headers();
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        responseHeaders.append(key, value.replace(/path=\/guacamole/gi, 'Path=/'));
      } else {
        responseHeaders.set(key, value);
      }
    });

    if (res.status !== 200) {
      const errText = await res.text();
      console.error(`[GuacamoleProxy] Error ${res.status}:`, errText.substring(0, 500));
      return new Response(errText, { status: res.status, headers: responseHeaders });
    }

    return new Response(res.body, { status: res.status, headers: responseHeaders });

  } catch (error) {
    console.error(`[GuacamoleProxy] ${method} error:`, error);
    return Response.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleProxy(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleProxy(request, 'POST');
}
