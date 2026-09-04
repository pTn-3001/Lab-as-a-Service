'use client';

import { AlertTriangle, ExternalLink, TerminalSquare } from 'lucide-react';

import { useMemo, Suspense } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// Local terminal shell page wraps Guacamole quick-connect in an iframe.

const DEFAULT_GUACAMOLE_BASE_URL =
  process.env.NEXT_PUBLIC_GUACAMOLE_BASE_URL?.trim() ||
  (typeof window !== 'undefined' ? window.location.origin + '/guacamole' : '') ||
  'https://os.openstack.robusta.vn/guacamole';
const DEFAULT_SSH_JUMP_1_HOST = process.env.NEXT_PUBLIC_SSH_JUMP_1_HOST?.trim() || '221.132.18.35';
const DEFAULT_SSH_JUMP_1_USER = process.env.NEXT_PUBLIC_SSH_JUMP_1_USER?.trim() || 'openstack';
const DEFAULT_SSH_JUMP_1_PASSWORD =
  process.env.NEXT_PUBLIC_SSH_JUMP_1_PASSWORD?.trim() || 'OpenSt4ck';
const DEFAULT_SSH_JUMP_2_HOST = process.env.NEXT_PUBLIC_SSH_JUMP_2_HOST?.trim() || 'ctrl-01';
const DEFAULT_SSH_JUMP_2_USER = process.env.NEXT_PUBLIC_SSH_JUMP_2_USER?.trim() || 'openstack';
const DEFAULT_SSH_JUMP_2_PASSWORD =
  process.env.NEXT_PUBLIC_SSH_JUMP_2_PASSWORD?.trim() || 'OpenSt4ck';

function buildJumpCommand(targetHost: string, targetUsername: string, targetPort: string): string {
  // If sshpass exists on jump host 1, auto-provide jump host 2 password; otherwise fallback to interactive password prompt.
  return `if command -v sshpass >/dev/null 2>&1; then sshpass -p '${DEFAULT_SSH_JUMP_2_PASSWORD}' ssh -tt ${DEFAULT_SSH_JUMP_2_USER}@${DEFAULT_SSH_JUMP_2_HOST} "ssh -p ${targetPort} -tt ${targetUsername}@${targetHost}"; else ssh -tt ${DEFAULT_SSH_JUMP_2_USER}@${DEFAULT_SSH_JUMP_2_HOST} "ssh -p ${targetPort} -tt ${targetUsername}@${targetHost}"; fi`;
}

function buildGuacamoleQuickConnectUrl(
  targetHost: string,
  targetUsername: string,
  targetPort: string
): string {
  // Quick-connect now always lands on jump host 1, then chains to jump host 2 and target VM.
  const base = DEFAULT_GUACAMOLE_BASE_URL.replace(/\/+$/, '');
  const quickConnect = new URLSearchParams({
    protocol: 'ssh',
    hostname: DEFAULT_SSH_JUMP_1_HOST,
    port: '22',
    username: DEFAULT_SSH_JUMP_1_USER,
    password: DEFAULT_SSH_JUMP_1_PASSWORD,
    // Preload command so session follows required chain to lab VM.
    command: buildJumpCommand(targetHost, targetUsername, targetPort),
    'font-name': 'monospace',
  });

  return `${base}/#/client/quickconnect?${quickConnect.toString()}`;
}

function TerminalPageContent() {
  const searchParams = useSearchParams();

  const host = searchParams.get('host')?.trim() ?? '';
  const username = searchParams.get('username')?.trim() || 'ubuntu';
  const port = searchParams.get('port')?.trim() || '22';


  const terminalUrl = useMemo(() => {
    // Always prioritize jump-host flow for lab VM access.
    if (!host) {
      return '';
    }

    return buildGuacamoleQuickConnectUrl(host, username, port);
  }, [host, port, username]);

  if (!terminalUrl) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>
            Thiếu thông tin kết nối để mở terminal. Vui lòng quay lại trang tài nguyên và bấm SSH
            lại.
          </span>
        </div>
        <Link
          href="/instructor/my-classes"
          className="inline-flex items-center rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          Quay lại danh sách lớp
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <TerminalSquare className="h-6 w-6 text-orange-700" />
            Terminal SSH
          </h1>
          <p className="text-sm text-gray-500">
            Jump 1: {DEFAULT_SSH_JUMP_1_USER}@{DEFAULT_SSH_JUMP_1_HOST} | Jump 2:{' '}
            {DEFAULT_SSH_JUMP_2_USER}@{DEFAULT_SSH_JUMP_2_HOST} | Target: {username}@{host}:{port}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={terminalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Mở tab Guacamole
            <ExternalLink className="h-4 w-4" />
          </a>
          <Link
            href="/instructor/my-classes"
            className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Quay lại danh sách lớp
          </Link>
        </div>
      </div>

      <div className="h-[calc(100vh-220px)] min-h-[560px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <iframe
          title="Guacamole Terminal"
          src={terminalUrl}
          className="h-full w-full"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải terminal...</div>}>
      <TerminalPageContent />
    </Suspense>
  );
}
