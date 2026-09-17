import { sessionStorage, type Session } from "./platform/session";
export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000";
let session: Session | null = null;
let refreshing: Promise<Session> | null = null;
let sessionGeneration = 0;
let storageUpdate: Promise<void> = Promise.resolve();
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let onSession: (session: Session | null) => void = () => {};
export function watchSession(listener: typeof onSession) {
  onSession = listener;
  return () => {
    onSession = () => {};
  };
}
export async function setSession(value: Session | null) {
  sessionGeneration++;
  refreshing = null;
  session = value;
  onSession(value);
  const update = storageUpdate
    .catch(() => {})
    .then(() => (value ? sessionStorage.write(value) : sessionStorage.clear()));
  storageUpdate = update;
  await update;
}
export async function restoreSession() {
  const generation = sessionGeneration;
  const restored = await sessionStorage.read();
  if (generation !== sessionGeneration) return;
  session = restored;
  onSession(session);
}
export function accessToken() {
  return session?.accessToken;
}
export async function api<T>(
  path: string,
  body?: unknown,
  key?: string,
  retry = true,
): Promise<T> {
  const requestSession = session;
  const generation = sessionGeneration;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestSession
          ? { Authorization: `Bearer ${requestSession.accessToken}` }
          : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (
    response.status === 401 &&
    requestSession &&
    retry &&
    !path.startsWith("/auth/")
  ) {
    if (generation !== sessionGeneration)
      throw new Error("Your account changed. Please try again.");
    if (session !== requestSession) return api<T>(path, body, key, false);
    if (!refreshing) {
      const pending = api<Session>(
        "/auth/refresh",
        { refreshToken: requestSession.refreshToken },
        undefined,
        false,
      )
        .then(async (value) => {
          if (generation !== sessionGeneration)
            throw new Error("Your account changed. Please try again.");
          session = value;
          onSession(value);
          const update = storageUpdate
            .catch(() => {})
            .then(() => sessionStorage.write(value));
          storageUpdate = update;
          await update;
          return value;
        })
        .catch(async (error) => {
          if (
            generation === sessionGeneration &&
            error instanceof ApiError &&
            error.status === 401
          )
            await setSession(null);
          throw error;
        })
        .finally(() => {
          if (refreshing === pending) refreshing = null;
        });
      refreshing = pending;
    }
    await refreshing;
    if (generation !== sessionGeneration)
      throw new Error("Your account changed. Please try again.");
    return api<T>(path, body, key, false);
  }
  const value: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof value === "object" && value && "message" in value
        ? String(value.message)
        : "Request failed.",
      response.status,
    );
  return value as T;
}
export async function logout() {
  const previous = session;
  await setSession(null);
  if (previous)
    await api("/auth/logout", { refreshToken: previous.refreshToken });
}
