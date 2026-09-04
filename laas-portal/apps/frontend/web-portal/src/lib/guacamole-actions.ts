'use server';

const ORCHESTRATION_BASE_URL =
  process.env.ORCHESTRATION_SERVICE_BASE_URL ?? 'http://localhost:3004';

function rewriteGuacamoleUrl(url: string, clientOrigin: string): string {
  // Replace server-local localhost:8080 with the client-facing public origin.
  // Nginx routes <public_origin>/guacamole/ → localhost:8080/guacamole/.
  for (const serverOrigin of ['http://localhost:8080', 'http://127.0.0.1:8080']) {
    if (url.startsWith(serverOrigin + '/guacamole')) {
      return clientOrigin + '/guacamole' + url.slice(serverOrigin.length + '/guacamole'.length);
    }
  }
  return url;
}

export async function openGuacamoleConnection(params: {
  host: string;
  port: number;
  connectionName: string;
  clientOrigin: string;
  username?: string;
  password?: string;
}): Promise<{ success: true; guacamoleUrl: string } | { success: false; message: string }> {
  try {
    const body: Record<string, unknown> = {
      connectionName: params.connectionName,
      host: params.host,
      port: params.port,
    };
    if (params.username) body.username = params.username;
    if (params.password) body.password = params.password;

    const response = await fetch(
      `${ORCHESTRATION_BASE_URL}/api/v1/openstack/guacamole/connections`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }
    );

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      return {
        success: false,
        message: (payload.message as string) ?? 'Orchestration service error',
      };
    }

    const rawUrl = (payload.guacamoleUrl as string) ?? '';
    return {
      success: true,
      guacamoleUrl: rewriteGuacamoleUrl(rawUrl, params.clientOrigin),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? `Không thể kết nối orchestration-service: ${error.message}`
          : 'Lỗi kết nối không xác định',
    };
  }
}
