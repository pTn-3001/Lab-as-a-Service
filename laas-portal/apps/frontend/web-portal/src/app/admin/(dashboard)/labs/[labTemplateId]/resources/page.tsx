'use client';

import { AlertTriangle, ExternalLink, Loader2, Server } from 'lucide-react';

import { type JSX, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * Resources page responsibilities:
 * - read stack refs passed from initialization flow
 * - fetch Heat resources through API proxy
 * - retry transient 404 cases during in-progress states
 * - show cached snapshot when latest fetch is unavailable
 */

type InitializedStackRef = {
  moduleId: string;
  moduleName: string;
  stackId: string;
  stackName: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type StackResourceItem = {
  logicalName: string;
  physicalResourceId: string;
  resourceType: string;
  resourceStatus: string;
  resourceStatusReason?: string;
  server?: {
    id: string;
    name: string;
    status: string;
    primaryIp?: string;
    sshHost?: string;
    sshPort?: number;
    sshUsername?: string;
    guacamoleSshUrl?: string | null;
  };
};

type StackResourcesPayload = {
  stack: {
    name: string;
    id: string;
    status: string;
    statusReason?: string;
    creationTime?: string;
    updatedTime?: string;
  };
  resources: StackResourceItem[];
};

type StackResult = {
  moduleName: string;
  moduleId?: string;
  stackName: string;
  stackId: string;
  payload?: StackResourcesPayload;
  error?: string;
  warning?: string;
};

type VmCred = { username: string; password: string };

const STACK_RESOURCE_CACHE_PREFIX = 'lab-stack-resources:';

function getStackResourceCacheKey(stackId: string): string {
  return `${STACK_RESOURCE_CACHE_PREFIX}${stackId}`;
}

function readCachedStackResources(stackId: string): StackResourcesPayload | null {
  // Local cache preserves last known-good resources on reload.
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(getStackResourceCacheKey(stackId));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const payload = parsed as StackResourcesPayload;
    if (!payload.stack || !Array.isArray(payload.resources)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function writeCachedStackResources(stackId: string, payload: StackResourcesPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getStackResourceCacheKey(stackId), JSON.stringify(payload));
}

const FRONTEND_GUACAMOLE_BASE_URL =
  process.env.NEXT_PUBLIC_GUACAMOLE_BASE_URL?.trim() || 'https://os.openstack.robusta.vn/guacamole';
const FRONTEND_GUACAMOLE_TEMPLATE =
  process.env.NEXT_PUBLIC_GUACAMOLE_SSH_URL_TEMPLATE?.trim() ?? '';
const FRONTEND_GUACAMOLE_DEFAULT_USERNAME =
  process.env.NEXT_PUBLIC_OPENSTACK_DEFAULT_SSH_USERNAME?.trim() || 'ubuntu';

function parseStackRefs(rawValue: string | null): InitializedStackRef[] {
  if (!rawValue) {
    return [];
  }

  const tryParse = (value: string): InitializedStackRef[] => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const record = item as Record<string, unknown>;
          return {
            moduleId: String(record.moduleId ?? ''),
            moduleName: String(record.moduleName ?? ''),
            stackId: String(record.stackId ?? ''),
            stackName: String(record.stackName ?? ''),
          };
        })
        .filter((item) => item.stackId && item.stackName);
    } catch {
      return [];
    }
  };

  const direct = tryParse(rawValue);
  if (direct.length > 0) {
    return direct;
  }

  return tryParse(decodeURIComponent(rawValue));
}

function rewriteToPublicGuacamoleUrl(url: string): string {
  const publicBase = FRONTEND_GUACAMOLE_BASE_URL.replace(/\/+$/, '');
  for (const serverOrigin of ['http://localhost:8080', 'http://127.0.0.1:8080']) {
    if (url.startsWith(serverOrigin + '/guacamole')) {
      return publicBase + url.slice(serverOrigin.length + '/guacamole'.length);
    }
  }
  return url;
}

function resolveGuacamoleUrl(
  serverIp?: string,
  backendUrl?: string | null,
  username: string = FRONTEND_GUACAMOLE_DEFAULT_USERNAME
): string | null {
  if (backendUrl?.trim()) {
    return rewriteToPublicGuacamoleUrl(backendUrl.trim());
  }

  if (!serverIp) {
    return null;
  }

  const baseUrl = FRONTEND_GUACAMOLE_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  const normalizedBase = baseUrl.replace(/\/+$/, '');
  if (FRONTEND_GUACAMOLE_TEMPLATE) {
    return FRONTEND_GUACAMOLE_TEMPLATE.replace('{baseUrl}', normalizedBase)
      .replace('{host}', encodeURIComponent(serverIp))
      .replace('{username}', encodeURIComponent(username))
      .replace('{port}', '22');
  }

  return `${normalizedBase}/#/client/quickconnect?protocol=ssh&hostname=${encodeURIComponent(serverIp)}&port=22&username=${encodeURIComponent(username)}`;
}

function buildLocalTerminalUrl(
  serverIp?: string,
  serverPort?: number,
  backendUrl?: string | null,
  username: string = FRONTEND_GUACAMOLE_DEFAULT_USERNAME,
  password?: string
): string | null {
  const upstreamGuacUrl = resolveGuacamoleUrl(serverIp, backendUrl, username);

  if (!upstreamGuacUrl && !serverIp) {
    return null;
  }

  const params = new URLSearchParams({ username });

  if (serverIp) {
    params.set('host', serverIp);
    params.set('port', serverPort ? String(serverPort) : '22');
  }

  if (password) {
    params.set('password', password);
  }

  if (upstreamGuacUrl) {
    params.set('guac', upstreamGuacUrl);
  }

  return `/admin/terminal?${params.toString()}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchStackResourcesWithRetry(
  stackRef: InitializedStackRef,
  maxRetries = 5,
  retryDelayMs = 2000
): Promise<StackResourcesPayload> {
  // Heat can briefly return 404 during transitions; retry before surfacing error.
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const encodedName = encodeURIComponent(stackRef.stackName);
      const encodedId = encodeURIComponent(stackRef.stackId);
      const response = await fetch(
        `/api/stacks/${encodedName}/${encodedId}/resources?userId=admin-portal-user`,
        {
          cache: 'no-store',
        }
      );

      const payload = (await response.json()) as ApiResponse<StackResourcesPayload>;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(
          payload.message ?? `Không lấy được resources cho stack ${stackRef.stackName}`
        );
      }

      return payload.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Lỗi không xác định';
      lastError = error instanceof Error ? error : new Error(message);

      const isNotFound = /status code 404/i.test(message);
      if (!isNotFound || attempt === maxRetries) {
        break;
      }

      await delay(retryDelayMs);
    }
  }

  throw lastError ?? new Error(`Không lấy được resources cho stack ${stackRef.stackName}`);
}

function toVmAlias(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function LabResourcesPage(): JSX.Element {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [results, setResults] = useState<StackResult[]>([]);
  const [vmCredsByKey, setVmCredsByKey] = useState<Record<string, VmCred>>({});

  const stackRefs = useMemo(() => parseStackRefs(searchParams.get('stacks')), [searchParams]);

  useEffect(() => {
    const loadResources = async () => {
      // Load all module stacks in parallel and aggregate display rows.
      if (stackRefs.length === 0) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const items = await Promise.all(
        stackRefs.map(async (stackRef): Promise<StackResult> => {
          try {
            const payload = await fetchStackResourcesWithRetry(stackRef);
            writeCachedStackResources(stackRef.stackId, payload);

            return {
              moduleName: stackRef.moduleName,
              moduleId: stackRef.moduleId,
              stackName: stackRef.stackName,
              stackId: stackRef.stackId,
              payload,
            };
          } catch (error) {
            const rawMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
            const isNotFound = /status code 404/i.test(rawMessage);

            if (isNotFound) {
              const cachedPayload = readCachedStackResources(stackRef.stackId);
              if (cachedPayload) {
                return {
                  moduleName: stackRef.moduleName,
                  moduleId: stackRef.moduleId,
                  stackName: stackRef.stackName,
                  stackId: stackRef.stackId,
                  payload: cachedPayload,
                  warning:
                    'Không lấy được dữ liệu mới từ Heat (404). Đang hiển thị dữ liệu đã lưu trước đó trong phiên làm việc này.',
                };
              }
            }

            const normalizedMessage = isNotFound
              ? 'Không lấy được resources: stack không tồn tại hoặc stack identifier không hợp lệ (404). Hãy khởi tạo lại lab.'
              : rawMessage;

            return {
              moduleName: stackRef.moduleName,
              moduleId: stackRef.moduleId,
              stackName: stackRef.stackName,
              stackId: stackRef.stackId,
              error: normalizedMessage,
            };
          }
        })
      );

      setResults(items);
      setIsLoading(false);
    };

    void loadResources();
  }, [stackRefs]);

  useEffect(() => {
    const moduleIds = [...new Set(results.map((r) => r.moduleId).filter(Boolean))] as string[];
    if (moduleIds.length === 0) return;

    const fetchCreds = async () => {
      const entries: [string, VmCred][] = [];
      await Promise.all(
        moduleIds.map(async (moduleId) => {
          try {
            const res = await fetch(`/api/modules/${moduleId}`, { cache: 'no-store' });
            const json = (await res.json()) as { success?: boolean; data?: { definitionJson?: unknown } };
            if (!json.success || !json.data?.definitionJson) return;
            const def = json.data.definitionJson as { vmConfigs?: Array<{ nodeName?: string; initialUsername?: string; initialPassword?: string }> };
            const vms = Array.isArray(def.vmConfigs) ? def.vmConfigs : [];
            vms.forEach((vm, idx) => {
              const alias = toVmAlias(vm.nodeName?.trim() || `vm_${idx + 1}`);
              entries.push([
                `${moduleId}:${alias}`,
                { username: vm.initialUsername?.trim() || 'labuser', password: vm.initialPassword?.trim() || '' },
              ]);
            });
          } catch {
            // silently skip — terminal URL will fall back to default username
          }
        })
      );
      if (entries.length > 0) {
        setVmCredsByKey((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    };

    void fetchCreds();
  }, [results]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Tài nguyên đã khởi tạo
          </h1>
          <p className="text-sm text-gray-500">
            Danh sách tài nguyên Heat theo từng module và nút SSH qua Guacamole.
          </p>
        </div>
        <Link
          href="/admin/labs"
          className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Quay lại danh sách lab
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang đợi...
        </div>
      )}

      {!isLoading && stackRefs.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Không có thông tin stack để hiển thị. Hãy khởi tạo lab từ menu hành động trước.
        </div>
      )}

      {!isLoading &&
        results.map((result) => (
          <section
            key={`${result.stackName}-${result.stackId}`}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <header className="border-b border-gray-100 px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Module: {result.moduleName || '--'}
                  </h2>
                  <p className="text-xs text-gray-500">
                    Stack: {result.stackName} ({result.stackId})
                  </p>
                </div>
                {result.payload && (
                  <div className="flex flex-col items-start gap-1 md:items-end">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {result.payload.stack.status || 'UNKNOWN'}
                    </span>
                    {result.payload.stack.statusReason && (
                      <span className="max-w-[520px] text-xs text-amber-700 md:text-right">
                        {result.payload.stack.statusReason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </header>

            {result.error && (
              <div className="flex items-start gap-2 px-5 py-4 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>{result.error}</span>
              </div>
            )}

            {result.warning && (
              <div className="flex items-start gap-2 px-5 py-4 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>{result.warning}</span>
              </div>
            )}

            {result.payload && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-600">
                    <tr>
                      <th className="px-5 py-3">Resource</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">IP / SSH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.payload.resources.map((resource) => (
                      <tr key={`${result.stackId}-${resource.logicalName}`}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">
                            {resource.logicalName || '--'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {resource.physicalResourceId || '--'}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{resource.resourceType || '--'}</td>
                        <td className="px-5 py-3">
                          <div className="space-y-1">
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {resource.resourceStatus || '--'}
                            </span>
                            {resource.resourceStatusReason && (
                              <div className="max-w-[420px] text-xs text-amber-700">
                                {resource.resourceStatusReason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {resource.server ? (
                            (() => {
                              const targetIp = resource.server.sshHost || resource.server.primaryIp;
                              const targetPort = resource.server.sshPort || 22;
                              const vmAlias = resource.logicalName.endsWith('_server')
                                ? resource.logicalName.slice(0, -'_server'.length)
                                : resource.logicalName;
                              const cred = result.moduleId
                                ? vmCredsByKey[`${result.moduleId}:${vmAlias}`]
                                : undefined;
                              const resolvedUsername =
                                cred?.username ||
                                resource.server.sshUsername ||
                                FRONTEND_GUACAMOLE_DEFAULT_USERNAME;
                              const localTerminalUrl = buildLocalTerminalUrl(
                                targetIp,
                                targetPort,
                                resource.server.guacamoleSshUrl,
                                resolvedUsername,
                                cred?.password
                              );

                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 text-xs text-gray-600">
                                    <Server className="h-3.5 w-3.5" />
                                    <span>{resource.server.name}</span>
                                  </div>
                                  <div className="text-xs text-gray-700">
                                    IP: {resource.server.primaryIp || 'N/A'}
                                  </div>
                                  {localTerminalUrl ? (
                                    <a
                                      href={localTerminalUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-800"
                                    >
                                      SSH qua Guacamole
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  ) : !resource.server.primaryIp ? (
                                    <div className="text-xs text-amber-700">
                                      Chưa có IP để mở SSH
                                    </div>
                                  ) : (
                                    <div className="text-xs text-amber-700">
                                      Chưa cấu hình NEXT_PUBLIC_GUACAMOLE_BASE_URL
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-gray-500">--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
    </div>
  );
}
