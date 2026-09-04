'use client';

/**
 * GuacamoleTerminal — kết nối SSH qua Guacamole WebSocket native client
 *
 * ARCHITECTURE:
 *   Browser → WebSocketTunnel → Nginx /guacamole/websocket-tunnel → Tomcat → guacd → VM
 *
 * AUTH FLOW (đúng):
 *   wsTunnelUrl   = ws://host/guacamole/websocket-tunnel   ← KHÔNG có ?token trong URL
 *   connectParams = "token=<TOKEN>&id=<RAW_ID>&width=...&height=...&dpi=96"
 *                              ↑ token + id đi cùng nhau trong Guacamole protocol frame
 *
 * ENCODING RULE:
 *   rawIdentifier = "MzQzAGMAbXlzcWw=" (base64 đã decode từ URL %3D → =)
 *   connectParams phải giữ nguyên dấu '=' trong id, KHÔNG dùng URLSearchParams
 *   vì URLSearchParams sẽ encode '=' → '%3D' → Tomcat có thể parse sai tùy version
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';
import { Loader2, AlertTriangle, RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from '@laas-portal/ui';

interface GuacamoleTerminalProps {
  guacamoleUrl: string;
  onReconnect?: () => void;
}

type ConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'WAITING'
  | 'CONNECTED'
  | 'DISCONNECTING'
  | 'DISCONNECTED';

/**
 * Parse guacamoleUrl → { publicBase, rawIdentifier, token }
 *
 * Input:  http://221.132.18.35:7300/guacamole/#/client/MzQzAGMAbXlzcWw%3D?token=ABC
 *
 * rawIdentifier: decode %3D → = để recover base64 gốc "MzQzAGMAbXlzcWw="
 *   Decoded = "343\x00c\x00mysql" (connectionId \0 type \0 datasource)
 */
function parseGuacamoleUrl(guacamoleUrl: string): {
  publicBase: string;
  rawIdentifier: string;
  token: string;
} {
  const hashIndex = guacamoleUrl.indexOf('/#/');
  if (hashIndex === -1) throw new Error('Invalid Guacamole URL: missing /#/');

  const publicBase = guacamoleUrl.substring(0, hashIndex);
  const rest = guacamoleUrl.substring(hashIndex + 3);

  const urlObj = new URL(guacamoleUrl.replace('/#/', '/'));
  const token = urlObj.searchParams.get('token') || '';

  const clientPathIndex = rest.indexOf('client/');
  if (clientPathIndex === -1) throw new Error('Invalid Guacamole URL: missing client/');

  const idStart = clientPathIndex + 7;
  const idEnd = rest.includes('?') ? rest.indexOf('?') : rest.length;
  const encodedIdentifier = rest.substring(idStart, idEnd);

  // Decode %3D → = (một lần duy nhất)
  const rawIdentifier = decodeURIComponent(encodedIdentifier);

  if (!token) throw new Error('Missing token in Guacamole URL');
  if (!rawIdentifier) throw new Error('Missing connection ID in Guacamole URL');

  console.log('[GuacamoleTerminal] Parsed URL:', {
    publicBase,
    rawIdentifier,
    identifierDecoded: (() => {
      try { return atob(rawIdentifier).replace(/\x00/g, '|'); } catch { return '?'; }
    })(),
    tokenPrefix: token.substring(0, 8) + '...',
  });

  return { publicBase, rawIdentifier, token };
}

/**
 * Build connectParams string cho Guacamole protocol handshake.
 *
 * QUAN TRỌNG: KHÔNG dùng URLSearchParams vì nó encode '=' → '%3D'.
 * Guacamole-common-js gửi string này raw vào WebSocket frame.
 * Tomcat parse bằng request.getParameter() (URL-decode), nhưng để an toàn
 * ta giữ '=' nguyên bản (unencoded) như Guacamole web app gốc làm.
 */
function buildConnectParams(
  token: string,
  rawIdentifier: string,
  width: number,
  height: number
): string {
  // Encode từng giá trị ngoại trừ rawIdentifier
  // rawIdentifier đã là base64 thuần (A-Za-z0-9+/=) — safe trong query string
  const parts = [
    `token=${encodeURIComponent(token)}`,
    `id=${rawIdentifier}`,          // GIỮ NGUYÊN dấu '=' trong base64
    `width=${width}`,
    `height=${height}`,
    `dpi=96`,
  ];
  return parts.join('&');
}

export function GuacamoleTerminal({ guacamoleUrl, onReconnect }: GuacamoleTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const mountCountRef = useRef<number>(0);

  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ wsUrl: string; params: string } | null>(null);

  const cleanup = useCallback((container: HTMLDivElement) => {
    if (clientRef.current) {
      try { clientRef.current.disconnect(); } catch (_) {}
      clientRef.current.onstatechange = null;
      clientRef.current.onerror = null;
      clientRef.current = null;
    }
    if (elementRef.current && container.contains(elementRef.current)) {
      container.removeChild(elementRef.current);
    }
    elementRef.current = null;
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    activeUrlRef.current = null;
  }, []);

  useEffect(() => {
    if (!guacamoleUrl || !containerRef.current) return;

    mountCountRef.current++;
    const container = containerRef.current;

    // Reuse nếu cùng URL
    if (clientRef.current && activeUrlRef.current === guacamoleUrl) {
      const el = clientRef.current.getDisplay().getElement();
      if (el && !container.contains(el)) container.appendChild(el);
      return;
    }

    if (clientRef.current) cleanup(container);
    activeUrlRef.current = guacamoleUrl;

    try {
      const { publicBase, rawIdentifier, token } = parseGuacamoleUrl(guacamoleUrl);

      const initWidth = Math.max(320, container.clientWidth || 800);
      const initHeight = Math.max(240, container.clientHeight || 600);

      // WebSocket URL — KHÔNG đặt token vào đây
      const wsBase = publicBase
        .replace(/^http:/i, 'ws:')
        .replace(/^https:/i, 'wss:')
        .replace(/\/$/, '');
      const wsTunnelUrl = `${wsBase}/websocket-tunnel`;

      // Connect params — token + id đi cùng nhau trong handshake
      const connectParams = buildConnectParams(token, rawIdentifier, initWidth, initHeight);

      console.log('[GuacamoleTerminal] WS URL:', wsTunnelUrl);
      console.log('[GuacamoleTerminal] Connect params:', connectParams);
      setDebugInfo({ wsUrl: wsTunnelUrl, params: connectParams });

      // Khởi tạo tunnel
      const tunnel = new Guacamole.WebSocketTunnel(wsTunnelUrl);
      tunnel.onerror = (status: Guacamole.Status) => {
        console.error('[GuacamoleTerminal] Tunnel error:', status.code, status.message);
        // error 768 = UPSTREAM_NOT_FOUND: connection ID không tồn tại hoặc token hết hạn
        // error 769 = UPSTREAM_TIMEOUT: guacd connect timeout
        // error 512 = SERVER_ERROR
        const errorMessages: Record<number, string> = {
          519: 'guacd không thể kết nối đến VM (519). Kiểm tra cấu hình SSH gateway trong orchestration-service.',
          520: 'Dịch vụ SSH chưa sẵn sàng (520). VM có thể đang khởi động — thử lại sau vài giây.',
          514: 'Kết nối đến VM bị timeout (514). VM có thể đang bận.',
          768: 'Không tìm thấy kết nối SSH (768). Token có thể đã hết hạn — thử reload trang.',
          769: 'SSH daemon không phản hồi (769). VM có thể chưa sẵn sàng.',
          512: 'Lỗi Guacamole server (512).',
          513: 'Guacamole server quá tải (513).',
        };
        setErrorMsg(errorMessages[status.code] || `Lỗi tunnel: ${status.message || status.code}`);
      };

      const client = new Guacamole.Client(tunnel);
      clientRef.current = client;

      // Display
      const display = client.getDisplay();
      const element = display.getElement();
      element.style.display = 'block';
      container.appendChild(element);
      elementRef.current = element;

      // Mouse
      const mouse = new Guacamole.Mouse(element);
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (ms: Guacamole.Mouse.State) => {
        clientRef.current?.sendMouseState(ms);
      };

      // Keyboard — bind vào container, không intercept khi không focused
      const keyboard = new Guacamole.Keyboard(container);
      keyboard.onkeydown = (keysym: number) => {
        clientRef.current?.sendKeyEvent(1, keysym);
        return false;
      };
      keyboard.onkeyup = (keysym: number) => {
        clientRef.current?.sendKeyEvent(0, keysym);
      };

      // State
      client.onstatechange = (state: number) => {
        console.log('[GuacamoleTerminal] State:', state);
        const stateMap: Record<number, ConnectionState> = {
          0: 'IDLE', 1: 'CONNECTING', 2: 'WAITING',
          3: 'CONNECTED', 4: 'DISCONNECTING', 5: 'DISCONNECTED',
        };
        setConnectionState(stateMap[state] ?? 'IDLE');
        if (state === 3) {
          setErrorMsg(null);
          container.focus();
          const dw = display.getWidth();
          const dh = display.getHeight();
          if (dw > 0 && dh > 0) {
            const scale = Math.min(
              container.clientWidth / dw,
              container.clientHeight / dh
            );
            display.scale(scale);
          }
        }
      };

      client.onerror = (status: Guacamole.Status) => {
        console.error('[GuacamoleTerminal] Client error:', status.code, status.message);
        const msg = status.message
          ? `${status.message} (code: ${status.code})`
          : `Lỗi kết nối (mã: ${status.code})`;
        setErrorMsg(msg);
      };

      // Resize
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries.length || !clientRef.current) return;
        const { width, height } = entries[0].contentRect;
        clientRef.current.sendSize(
          Math.max(320, Math.floor(width)),
          Math.max(240, Math.floor(height))
        );
        clientRef.current.getDisplay().scale(1);
      });
      resizeObserver.observe(container);
      resizeObserverRef.current = resizeObserver;

      // Connect
      client.connect(connectParams);

    } catch (err) {
      console.error('[GuacamoleTerminal] Init error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khởi tạo terminal');
    }

    return () => {
      mountCountRef.current--;
      setTimeout(() => {
        if (mountCountRef.current === 0) cleanup(container);
      }, 300);
    };
  }, [guacamoleUrl, cleanup]);

  const handleReconnect = useCallback(() => {
    if (!containerRef.current) return;
    cleanup(containerRef.current);
    setErrorMsg(null);
    setConnectionState('IDLE');
    if (onReconnect) {
      onReconnect();
    } else {
      window.location.reload();
    }
  }, [cleanup, onReconnect]);

  const stateLabel: Record<ConnectionState, string> = {
    IDLE:          'Đang khởi động terminal…',
    CONNECTING:    'Đang mở kết nối WebSocket…',
    WAITING:       'Đang chờ SSH daemon phản hồi…',
    CONNECTED:     '',
    DISCONNECTING: 'Đang ngắt kết nối…',
    DISCONNECTED:  'Phiên SSH đã đóng.',
  };

  return (
    <div className="relative h-full w-full bg-black">
      <div
        ref={containerRef}
        tabIndex={0}
        className="w-full h-full focus:outline-none overflow-hidden cursor-text"
        onClick={() => containerRef.current?.focus()}
      />

      {/* Status overlay */}
      {connectionState !== 'CONNECTED' && !errorMsg && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-950 text-white p-6 text-center pointer-events-none">
          {connectionState === 'DISCONNECTED'
            ? <WifiOff className="h-10 w-10 text-gray-500" />
            : <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
          }
          <p className="text-sm font-medium">{stateLabel[connectionState]}</p>
          {debugInfo && connectionState !== 'IDLE' && connectionState !== 'DISCONNECTED' && (
            <p className="max-w-sm text-xs text-gray-600 font-mono break-all">{debugInfo.wsUrl}</p>
          )}
          {connectionState === 'DISCONNECTED' && (
            <Button
              onClick={handleReconnect}
              className="pointer-events-auto mt-2 bg-orange-600 hover:bg-orange-700"
            >
              <RefreshCcw className="mr-2 h-4 w-4" /> Kết nối lại
            </Button>
          )}
        </div>
      )}

      {/* Error overlay */}
      {errorMsg && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-gray-950 p-8 text-center text-white">
          <AlertTriangle className="h-12 w-12 text-red-500" />
          <p className="text-lg font-semibold text-red-300">Lỗi kết nối Terminal</p>
          <p className="max-w-md text-sm text-gray-300">{errorMsg}</p>
          {debugInfo && (
            <div className="max-w-md text-left bg-gray-900 rounded p-3 text-xs font-mono text-gray-500 break-all space-y-1">
              <p><span className="text-gray-400">WS:</span> {debugInfo.wsUrl}</p>
              <p><span className="text-gray-400">params:</span> {debugInfo.params}</p>
            </div>
          )}
          <Button
            onClick={handleReconnect}
            className="mt-2 bg-orange-600 hover:bg-orange-700"
          >
            <RefreshCcw className="mr-2 h-4 w-4" /> Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}
