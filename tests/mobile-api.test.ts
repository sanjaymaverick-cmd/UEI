import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../apps/mobile/src/platform/session";

const storage = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../apps/mobile/src/platform/session", () => ({
  sessionStorage: storage,
}));
const initial: Session = {
  accessToken: "old-access",
  refreshToken: "old-refresh",
  user: { id: "driver", phone: "+919876543210", role: "CONSUMER" },
};
const rotated = {
  ...initial,
  accessToken: "new-access",
  refreshToken: "new-refresh",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("mobile session recovery", () => {
  it("shares an in-flight refresh and preserves command idempotency on retry", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    const refresh = deferred<Response>();
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).endsWith("/auth/refresh")) return refresh.promise;
      const headers = options?.headers as Record<string, string>;
      return headers.Authorization === "Bearer old-access"
        ? json({}, 401)
        : json({ ok: true });
    });
    const first = client.api(
      "/orders",
      { vehicleId: "ev" },
      "stable-command-key",
    );
    const second = client.api("/vehicles");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    refresh.resolve(json(rotated));
    await Promise.all([first, second]);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/auth/refresh"),
      ),
    ).toHaveLength(1);
    const commands = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/orders"),
    );
    expect(commands).toHaveLength(2);
    for (const [, options] of commands) {
      expect(options?.headers).toMatchObject({
        "Idempotency-Key": "stable-command-key",
      });
      expect(options?.body).toBe(JSON.stringify({ vehicleId: "ev" }));
    }
  });

  it("does not replay an old account's command under a new sign-in", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    const late = deferred<Response>();
    fetchMock.mockReturnValueOnce(late.promise);
    const request = client.api("/orders", { vehicleId: "ev" }, "command");
    const rejected = expect(request).rejects.toThrow("account changed");
    await client.setSession({
      ...rotated,
      user: { ...initial.user, id: "other" },
    });
    late.resolve(json({}, 401));
    await rejected;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(client.accessToken()).toBe(rotated.accessToken);
  });

  it("ignores stored credentials if logout occurs during restoration", async () => {
    const client = await import("../apps/mobile/src/api");
    const stored = deferred<Session>();
    storage.read.mockReturnValueOnce(stored.promise);
    const restore = client.restoreSession();
    await client.logout();
    stored.resolve(initial);
    await restore;
    expect(client.accessToken()).toBeUndefined();
  });

  it("shares a refresh and reuses its token for a delayed unauthorized response", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    const late = deferred<Response>();
    const refresh = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockReturnValueOnce(late.promise)
      .mockReturnValueOnce(refresh.promise)
      .mockImplementation(async () => json({ ok: true }));
    const first = client.api("/vehicles");
    const second = client.api("/orders");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    refresh.resolve(json(rotated));
    await first;
    late.resolve(json({}, 401));
    await second;
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/auth/refresh"),
      ),
    ).toHaveLength(1);
    expect(fetchMock.mock.calls.at(-1)?.[1]?.headers).toMatchObject({
      Authorization: "Bearer new-access",
    });
  });

  it.each(["network", "server"])(
    "preserves sign-in on a temporary %s refresh failure",
    async (failure) => {
      const client = await import("../apps/mobile/src/api");
      await client.setSession(initial);
      fetchMock.mockResolvedValueOnce(json({}, 401));
      if (failure === "network")
        fetchMock.mockRejectedValueOnce(new Error("offline"));
      else
        fetchMock.mockResolvedValueOnce(json({ message: "Unavailable" }, 503));
      await expect(client.api("/vehicles")).rejects.toThrow();
      expect(client.accessToken()).toBe(initial.accessToken);
      expect(storage.clear).not.toHaveBeenCalled();
    },
  );

  it("clears a session when refresh credentials are rejected", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    fetchMock.mockResolvedValue(json({ message: "Sign in again" }, 401));
    await expect(client.api("/vehicles")).rejects.toThrow("Sign in again");
    expect(client.accessToken()).toBeUndefined();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  it("does not restore a session when refresh finishes after logout", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    const refresh = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce(json({ loggedOut: true }));
    const request = client.api("/vehicles");
    const rejected = expect(request).rejects.toThrow("account changed");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await client.logout();
    refresh.resolve(json(rotated));
    await rejected;
    expect(client.accessToken()).toBeUndefined();
    expect(storage.write).toHaveBeenCalledTimes(1);
  });

  it("clears local credentials even when server logout fails", async () => {
    const client = await import("../apps/mobile/src/api");
    await client.setSession(initial);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(client.logout()).rejects.toThrow();
    expect(client.accessToken()).toBeUndefined();
    expect(storage.clear).toHaveBeenCalledOnce();
  });
});
