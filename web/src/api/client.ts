const TOKEN_KEY = "triptrace_token";
const EDIT_TOKEN_KEY = "triptrace_edit_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getEditToken() {
  return sessionStorage.getItem(EDIT_TOKEN_KEY);
}

export function setEditToken(token: string) {
  sessionStorage.setItem(EDIT_TOKEN_KEY, token);
}

export function clearEditToken() {
  sessionStorage.removeItem(EDIT_TOKEN_KEY);
}

export type ApiResult<T> =
  | { code: 0; data: T }
  | { code: number; data: null; message: string };

export function isErr<T>(
  res: ApiResult<T>,
): res is { code: number; data: null; message: string } {
  return res.code !== 0;
}

export type ApiOpts = {
  /** 覆盖默认 owner token；传 null 表示不带 Authorization */
  token?: string | null;
};

export async function api<T>(
  path: string,
  init: RequestInit = {},
  opts?: ApiOpts,
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = opts && "token" in opts ? opts.token : getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const json = (await res.json()) as ApiResult<T>;
  if (json.code === 40101 || json.code === 40102) {
    if (!(opts && "token" in opts)) {
      clearToken();
      // keep zustand / UI in sync with localStorage
      window.dispatchEvent(new Event("triptrace:auth-cleared"));
    }
  }
  return json;
}
