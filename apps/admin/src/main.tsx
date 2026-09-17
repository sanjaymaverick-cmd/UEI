import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import "./styles.css";
const cache = new QueryClient();
type Session = {
  accessToken: string;
  refreshToken: string;
  user: { role: string };
};
type Transaction = { id: string; kind: string; createdAt: string };
type Trace = Transaction & {
  messages: {
    id: string;
    createdAt: string;
    action: string;
    direction: string;
    messageId: string;
    providerId: string;
    ack: string | null;
    error: string | null;
    payload: unknown;
  }[];
  audit: {
    id: number;
    createdAt: string;
    action: string;
    before: string | null;
    after: string | null;
  }[];
  issues: { id: string; reason: string; resolvedAt: string | null }[];
  outbox: { id: string; kind: string; state: string; messageId: string }[];
  payment: {
    id: string;
    state: string;
    method: string;
    collector: string;
    capability: string;
    amountPaise: number;
    providerReference: string | null;
    attempts: {
      id: string;
      state: string;
      createdAt: string;
      failureReason: string | null;
    }[];
    events: { id: string; kind: string; createdAt: string }[];
  } | null;
};
let session: Session | null = null; // Deliberately memory-only in the browser.
let refreshing: Promise<void> | null = null;
async function request<T>(
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const response = await fetch(`http://localhost:3000/v1${path}`, {
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
function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [phone, setPhone] = useState("+919999999999");
  const [otp, setOtp] = useState("");
  const [selected, setSelected] = useState("");
  const send = useMutation({
    mutationFn: () => request("/auth/request-otp", { phone }),
  });
  const login = useMutation({
    mutationFn: async () => {
      const value = await request<Session>("/auth/verify-otp", { phone, otp });
      if (value.user.role !== "ADMIN") {
        await request("/auth/logout", { refreshToken: value.refreshToken });
        throw new Error("This account does not have admin access.");
      }
      session = value;
      setSignedIn(true);
    },
  });
  const logout = useMutation({
    mutationFn: async () => {
      if (session)
        await request("/auth/logout", { refreshToken: session.refreshToken });
      session = null;
      cache.clear();
      setSelected("");
      setSignedIn(false);
    },
  });
  const transactions = useQuery({
    queryKey: ["transactions"],
    queryFn: () => request<Transaction[]>("/admin/transactions"),
    enabled: signedIn,
    refetchInterval: signedIn ? 3000 : false,
  });
  const trace = useQuery({
    queryKey: ["trace", selected],
    queryFn: () => request<Trace>(`/admin/transactions/${selected}`),
    enabled: signedIn && !!selected,
    refetchInterval: signedIn && selected ? 1500 : false,
  });
  const error =
    send.error ??
    login.error ??
    transactions.error ??
    trace.error ??
    logout.error;
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">UEI · OPERATIONS</p>
          <h1>Transaction trace</h1>
          <p>Inspect requests, callbacks and durable state transitions.</p>
        </div>
        <span className="badge">SIMULATOR</span>
      </header>
      {error && (
        <p role="alert" className="error">
          {error.message}
        </p>
      )}
      {!signedIn ? (
        <section className="login">
          <h2>Admin sign in</h2>
          <p>Development provider — no SMS is sent.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate();
            }}
          >
            <label>
              Mobile number
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
              />
            </label>
            <button
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate()}
            >
              Request code
            </button>
            {send.isSuccess && <p>Use the configured development code.</p>}
            <label>
              Verification code
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
              />
            </label>
            <button disabled={login.isPending}>Sign in</button>
          </form>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <span>{transactions.data?.length ?? 0} recent transactions</span>
            <button disabled={logout.isPending} onClick={() => logout.mutate()}>
              Sign out
            </button>
          </div>
          <div className="layout">
            <nav aria-label="Transactions">
              {transactions.isLoading && <p>Loading…</p>}
              {transactions.data?.length === 0 && (
                <p>No transactions yet. Start a charger search in the app.</p>
              )}
              {transactions.data?.map((transaction) => (
                <button
                  className={selected === transaction.id ? "selected" : ""}
                  key={transaction.id}
                  onClick={() => setSelected(transaction.id)}
                >
                  <strong>{transaction.kind}</strong>
                  <span>{transaction.id.slice(0, 8)}</span>
                  <small>
                    {new Date(transaction.createdAt).toLocaleString()}
                  </small>
                </button>
              ))}
            </nav>
            <article>
              {!selected && (
                <div className="empty">
                  <h2>Select a transaction</h2>
                  <p>
                    Its persisted timeline and raw messages will appear here.
                  </p>
                </div>
              )}
              {trace.data && (
                <>
                  <h2>
                    {trace.data.kind} <small>{trace.data.id}</small>
                  </h2>
                  <h3>State timeline</h3>
                  <ol>
                    {trace.data.audit.map((event) => (
                      <li key={event.id}>
                        <time>
                          {new Date(event.createdAt).toLocaleTimeString()}
                        </time>
                        <strong>{event.action}</strong>
                        <span>
                          {event.before ?? "—"} → {event.after ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <h3>Protocol messages</h3>
                  {trace.data.messages.map((message) => (
                    <details key={message.id}>
                      <summary>
                        <span>
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </span>{" "}
                        <strong>{message.action}</strong> · {message.direction}{" "}
                        · {message.providerId} · {message.ack ?? "PENDING"}
                      </summary>
                      <p>Message ID: {message.messageId}</p>
                      {message.error && (
                        <p className="error">{message.error}</p>
                      )}
                      <pre>{JSON.stringify(message.payload, null, 2)}</pre>
                    </details>
                  ))}
                  <h3>Delivery records</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Status</th>
                        <th>Message ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.data.outbox.map((event) => (
                        <tr key={event.id}>
                          <td>{event.kind}</td>
                          <td>{event.state}</td>
                          <td>{event.messageId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3>Payment</h3>
                  {trace.data.payment ? (
                    <>
                      <p>
                        {trace.data.payment.state} · ₹
                        {(trace.data.payment.amountPaise / 100).toFixed(2)} ·{" "}
                        {trace.data.payment.method} via{" "}
                        {trace.data.payment.collector} ·{" "}
                        {trace.data.payment.capability}
                      </p>
                      {trace.data.payment.attempts.map((attempt) => (
                        <p key={attempt.id}>
                          {new Date(attempt.createdAt).toLocaleTimeString()} ·{" "}
                          {attempt.state}
                          {attempt.failureReason
                            ? ` · ${attempt.failureReason}`
                            : ""}
                        </p>
                      ))}
                    </>
                  ) : (
                    <p>No payment has been initiated.</p>
                  )}
                  <h3>Reconciliation</h3>
                  {trace.data.issues.length === 0 ? (
                    <p>No issues recorded.</p>
                  ) : (
                    trace.data.issues.map((issue) => (
                      <p key={issue.id}>
                        {issue.resolvedAt ? "Resolved" : "Open"} ·{" "}
                        {issue.reason}
                      </p>
                    ))
                  )}
                </>
              )}
            </article>
          </div>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <App />
  </QueryClientProvider>,
);
