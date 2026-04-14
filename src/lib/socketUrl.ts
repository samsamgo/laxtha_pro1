const SOCKET_PATH = "/fx2";
const DEFAULT_LOCAL_URL = `ws://localhost:8080${SOCKET_PATH}`;

export const normalizeWebSocketUrl = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return DEFAULT_LOCAL_URL;
  }

  const normalizedInput = /^wss?:\/\//.test(trimmed) ? trimmed : `ws://${trimmed}`;

  try {
    const url = new URL(normalizedInput);

    if (url.pathname === "/" || !url.pathname) {
      url.pathname = SOCKET_PATH;
    }

    return url.toString();
  } catch {
    if (normalizedInput.endsWith(SOCKET_PATH)) {
      return normalizedInput;
    }

    return `${normalizedInput.replace(/\/+$/, "")}${SOCKET_PATH}`;
  }
};

export const getDefaultWebSocketUrl = () => {
  const envUrl = import.meta.env.VITE_FX2_WS_URL;

  if (envUrl) {
    return normalizeWebSocketUrl(envUrl);
  }

  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (import.meta.env.DEV) {
    return `${protocol}//${window.location.hostname}:8080${SOCKET_PATH}`;
  }

  return `${protocol}//${window.location.host}${SOCKET_PATH}`;
};
