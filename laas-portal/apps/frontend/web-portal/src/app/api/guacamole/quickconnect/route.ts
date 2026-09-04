import { NextRequest, NextResponse } from 'next/server';

// BFF proxy for Guacamole quickconnect requests to orchestration-service.

const DEFAULT_ORCHESTRATION_SERVICE_BASE_URL = 'http://localhost:3004';
const FALLBACK_ORCHESTRATION_SERVICE_BASE_URL = 'http://127.0.0.1:3004';

// The orchestration service returns guacamoleUrl pointing to localhost:8080 (server-side).
// We must rewrite it to the public-facing Guacamole base URL so the browser can reach it.
const GUACAMOLE_SERVER_ORIGINS = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const GUACAMOLE_SERVER_PATH = '/guacamole';

function rewriteGuacamoleUrl(url: string, publicGuacamoleBase: string): string {
  if (!publicGuacamoleBase) return url;
  for (const origin of GUACAMOLE_SERVER_ORIGINS) {
    if (url.startsWith(origin + GUACAMOLE_SERVER_PATH)) {
      return publicGuacamoleBase + url.slice(origin.length + GUACAMOLE_SERVER_PATH.length);
    }
  }
  return url;
}

function getOrchestrationBaseUrls(): string[] {
  // Try configured URL first, then localhost fallbacks for local development.
  const configured =
    process.env.ORCHESTRATION_SERVICE_BASE_URL ??
    process.env.NEXT_PUBLIC_ORCHESTRATION_SERVICE_BASE_URL;

  if (configured?.trim()) {
    return [configured.trim()];
  }

  return [DEFAULT_ORCHESTRATION_SERVICE_BASE_URL, FALLBACK_ORCHESTRATION_SERVICE_BASE_URL];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const host = searchParams.get('host')?.trim() || '';
    const port = searchParams.get('port')?.trim() || '22';
    const connectionName = searchParams.get('connectionName')?.trim() || `SSH_${host}_${Date.now()}`;
    const username = searchParams.get('username')?.trim() || '';
    const password = searchParams.get('password')?.trim() || '';
    // clientOrigin from browser (window.location.origin) — always the correct public-facing origin
    const clientOriginParam = searchParams.get('clientOrigin')?.trim() || '';

    if (!host) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameter: host' },
        { status: 400 }
      );
    }

    // Priority: browser-supplied clientOrigin > NEXT_PUBLIC_GUACAMOLE_BASE_URL env var > server request origin fallback
    const publicGuacamoleBase =
      (clientOriginParam ? clientOriginParam.replace(/\/$/, '') + '/guacamole' : '') ||
      process.env.NEXT_PUBLIC_GUACAMOLE_BASE_URL?.replace(/\/$/, '') ||
      new URL(request.url).origin.replace(/\/$/, '') + '/guacamole';

    const baseUrls = getOrchestrationBaseUrls();
    let lastError: Error | null = null;

    for (const baseUrl of baseUrls) {
      try {
        const upstreamUrl = new URL('/api/v1/openstack/guacamole/connections', baseUrl);

        const upstreamResponse = await fetch(upstreamUrl.toString(), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            connectionName,
            host,
            port: Number(port) || 22,
            username: username || undefined,
            password: password || undefined,
          }),
          cache: 'no-store',
        });

        const text = await upstreamResponse.text();
        const payload = text
          ? JSON.parse(text)
          : { success: false, message: 'Empty response body' };

        if (!upstreamResponse.ok) {
          return NextResponse.json(
            { success: false, message: payload.message || 'Orchestration service error' },
            { status: upstreamResponse.status }
          );
        }

        return NextResponse.json({
          success: true,
          guacamoleUrl: rewriteGuacamoleUrl(payload.guacamoleUrl, publicGuacamoleBase),
          connectionId: payload.connectionId,
          connectionName: payload.connectionName,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown fetch error');
      }
    }

    throw lastError ?? new Error('Unknown orchestration connection error');
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? `Khong the ket noi orchestration-service: ${error.message}`
            : 'Khong the ket noi orchestration-service',
      },
      { status: 502 }
    );
  }
}
