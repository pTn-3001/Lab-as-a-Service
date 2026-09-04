/**
 * Type declarations for guacamole-common-js
 * @see https://guacamole.apache.org/doc/guacamole-common-js/
 */
declare module 'guacamole-common-js' {
  namespace Guacamole {
    class Client {
      constructor(tunnel: Tunnel);
      connect(data?: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: 0 | 1, keysym: number): void;
      sendMouseState(state: Mouse.State): void;
      sendSize(width: number, height: number): void;
      getDisplay(): Display;
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      onclipboard: ((stream: InputStream, mimetype: string) => void) | null;

      static readonly State: {
        readonly IDLE: 0;
        readonly CONNECTING: 1;
        readonly WAITING: 2;
        readonly CONNECTED: 3;
        readonly DISCONNECTING: 4;
        readonly DISCONNECTED: 5;
      };
    }

    class Display {
      getElement(): HTMLElement;
      getWidth(): number;
      getHeight(): number;
      getDefaultLayer(): Display.VisibleLayer;
      scale(scale: number): void;
      onresize: ((width: number, height: number) => void) | null;
    }

    namespace Display {
      class VisibleLayer {
        width: number;
        height: number;
      }
    }

    interface Tunnel {
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      oninstruction: ((opcode: string, args: string[]) => void) | null;
      state: number;

      connect(data?: string): void;
      disconnect(): void;
      sendMessage(...elements: unknown[]): void;
    }

    class WebSocketTunnel implements Tunnel {
      constructor(tunnelURL: string);
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      oninstruction: ((opcode: string, args: string[]) => void) | null;
      state: number;
      connect(data?: string): void;
      disconnect(): void;
      sendMessage(...elements: unknown[]): void;

      static readonly State: {
        readonly CLOSED: 0;
        readonly CONNECTING: 1;
        readonly OPEN: 2;
        readonly UNSTABLE: 3;
      };
    }

    class HTTPTunnel implements Tunnel {
      constructor(tunnelURL: string, crossDomain?: boolean, extraTunnelHeaders?: Record<string, string>);
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      oninstruction: ((opcode: string, args: string[]) => void) | null;
      state: number;
      connect(data?: string): void;
      disconnect(): void;
      sendMessage(...elements: unknown[]): void;
    }

    class ChainedTunnel implements Tunnel {
      constructor(...tunnels: Tunnel[]);
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      oninstruction: ((opcode: string, args: string[]) => void) | null;
      state: number;
      connect(data?: string): void;
      disconnect(): void;
      sendMessage(...elements: unknown[]): void;
    }

    class Keyboard {
      constructor(element: HTMLElement | Document);
      onkeydown: ((keysym: number) => boolean | void) | null;
      onkeyup: ((keysym: number) => void) | null;
      press(keysym: number): void;
      release(keysym: number): void;
      reset(): void;
      listenTo(element: HTMLElement | Document): void;
    }

    class Mouse {
      constructor(element: HTMLElement);
      onEach(events: string[], handler: (e: MouseEvent) => void): void;
      onmousedown: ((state: Mouse.State) => void) | null;
      onmouseup: ((state: Mouse.State) => void) | null;
      onmousemove: ((state: Mouse.State) => void) | null;

      static State: new (x: number, y: number, left: boolean, middle: boolean, right: boolean, up: boolean, down: boolean) => Mouse.State;
    }

    namespace Mouse {
      interface State {
        x: number;
        y: number;
        left: boolean;
        middle: boolean;
        right: boolean;
        up: boolean;
        down: boolean;
      }

      class Touchpad {
        constructor(element: HTMLElement);
        onmousedown: ((state: Mouse.State) => void) | null;
        onmouseup: ((state: Mouse.State) => void) | null;
        onmousemove: ((state: Mouse.State) => void) | null;
      }

      class Touchscreen {
        constructor(element: HTMLElement);
        onmousedown: ((state: Mouse.State) => void) | null;
        onmouseup: ((state: Mouse.State) => void) | null;
        onmousemove: ((state: Mouse.State) => void) | null;
      }
    }

    class Status {
      constructor(code: number, message?: string);
      code: number;
      message?: string;
      isError(): boolean;

      static readonly Code: {
        readonly SUCCESS: number;
        readonly UNSUPPORTED: number;
        readonly SERVER_ERROR: number;
        readonly SERVER_BUSY: number;
        readonly UPSTREAM_TIMEOUT: number;
        readonly UPSTREAM_ERROR: number;
        readonly RESOURCE_NOT_FOUND: number;
        readonly RESOURCE_CONFLICT: number;
        readonly UPSTREAM_NOT_FOUND: number;
        readonly UPSTREAM_UNAVAILABLE: number;
        readonly SESSION_CONFLICT: number;
        readonly SESSION_TIMEOUT: number;
        readonly SESSION_CLOSED: number;
        readonly CLIENT_BAD_REQUEST: number;
        readonly CLIENT_UNAUTHORIZED: number;
        readonly CLIENT_FORBIDDEN: number;
        readonly CLIENT_TIMEOUT: number;
        readonly CLIENT_OVERRUN: number;
        readonly CLIENT_BAD_TYPE: number;
        readonly CLIENT_TOO_MANY: number;
      };
    }

    class InputStream {
      onblob: ((data: string) => void) | null;
      onend: (() => void) | null;
    }

    class StringReader {
      constructor(stream: InputStream);
      ontext: ((text: string) => void) | null;
      onend: (() => void) | null;
    }
  }

  export = Guacamole;
}
