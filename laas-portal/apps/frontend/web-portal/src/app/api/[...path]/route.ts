/**
 * Single BFF catch-all — forwards every /api/* request to the API gateway.
 *
 * Specific handlers that are NOT replaced:
 *   - /api/guacamole/tunnel       (WebSocket HTTP tunnel, custom logic)
 *   - /api/guacamole/quickconnect (guacamoleUrl rewrite in response)
 */
import { NextRequest, NextResponse } from 'next/server';

const API_GATEWAY_URL = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(request: NextRequest, context: Ctx): Promise<NextResponse> {
  const { path } = await context.params;
  const subPath = path.join('/');

  // Build upstream URL preserving query string
  const upstreamUrl = new URL(`/api/${subPath}`, API_GATEWAY_URL);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  const method = request.method.toUpperCase();

  // Read body for mutating methods
  let body: ArrayBuffer | undefined;
  if (!['GET', 'HEAD', 'DELETE'].includes(method)) {
    try {
      body = await request.arrayBuffer();
      if (body.byteLength === 0) body = undefined;
    } catch {
      // ignore
    }
  }

  // Forward relevant headers
  const forwardHeaders: Record<string, string> = {};

  // Prefer explicit Authorization header; fall back to laas-token cookie
  let authHeader = request.headers.get('authorization');
  if (!authHeader) {
    const cookieHeader = request.headers.get('cookie') ?? '';
    const laasToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('laas-token='))
      ?.slice('laas-token='.length);
    if (laasToken) authHeader = `Bearer ${laasToken}`;
  }
  if (authHeader) forwardHeaders['authorization'] = authHeader;

  const contentType = request.headers.get('content-type');
  if (contentType) forwardHeaders['content-type'] = contentType;

  const requestId = request.headers.get('x-request-id');
  if (requestId) forwardHeaders['x-request-id'] = requestId;

  const upstream = await fetch(upstreamUrl.toString(), {
    method,
    headers: forwardHeaders,
    body: body,
    cache: 'no-store',
  });

  // Collect response headers to forward
  const responseHeaders = new Headers();
  const upstreamRequestId = upstream.headers.get('x-request-id');
  if (upstreamRequestId) responseHeaders.set('x-request-id', upstreamRequestId);

  const upstreamContentType = upstream.headers.get('content-type') ?? '';

  // For JSON responses parse and re-encode; for everything else stream bytes through
  if (upstreamContentType.includes('application/json')) {
    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  // Binary / text / other content types — pass bytes through
  const data = await upstream.arrayBuffer();
  responseHeaders.set('content-type', upstreamContentType || 'application/octet-stream');

  return new NextResponse(data, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
};
