export type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
};
const STORAGE_KEY = "plugmitra.session";
const BASE = `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000"}/v1`;
function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
let session: Session | null = load();
let refreshing: Promise<void> | null = null;
function persist() {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private browsing); the session still works for this tab.
  }
}
export function currentUser() {
  return session?.user ?? null;
}
export async function request<T>(
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (
    response.status === 401 &&
    retry &&
    session &&
    !path.startsWith("/auth/")
  ) {
    refreshing ??= request<Session>(
      "/auth/refresh",
      { refreshToken: session.refreshToken },
      false,
    )
      .then((value) => {
        session = value;
        persist();
      })
      .finally(() => {
        refreshing = null;
      });
    await refreshing;
    return request(path, body, false);
  }
  const value = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(value.message ?? "Request failed.");
  return value;
}
export async function loginWithGoogle(idToken: string) {
  session = await request<Session>("/auth/google", { idToken }, false);
  persist();
}
export async function logout() {
  if (session) {
    await request("/auth/logout", { refreshToken: session.refreshToken }).catch(
      () => {},
    );
  }
  session = null;
  persist();
}
