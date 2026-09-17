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
    capturedPaise: number;
    releasedPaise: number;
    providerReference: string | null;
    attempts: {
      id: string;
      state: string;
      createdAt: string;
      failureReason: string | null;
    }[];
    events: { id: string; kind: string; createdAt: string }[];
    refunds: {
      id: string;
      state: string;
      amountPaise: number;
      reason: string | null;
      createdAt: string;
      resolvedAt: string | null;
    }[];
  } | null;
  order: {
    invoice: {
      state: string;
      energyWh: number;
      ratePaiseKwh: number;
      subtotalPaise: number;
      taxPaise: number;
      totalPaise: number;
    } | null;
    fulfillment: {
      state: string;
      session: {
        id: string;
        state: string;
        energyWh: number;
        startedAt: string | null;
        endedAt: string | null;
        measuredAt: string | null;
        events: { id: string; kind: string; createdAt: string }[];
        readings: { id: string; measuredAt: string; energyWh: number }[];
      } | null;
    } | null;
  } | null;
};
let session: Session | null = null; // Deliberately memory-only in the browser.
let refreshing: Promise<void> | null = null;
async function request<T>(
  path: string,
  body?: unknown,
  retry = true,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`http://localhost:3000/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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
    return request(path, body, false, idempotencyKey);
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
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
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
  const refund = useMutation({
    mutationFn: (paymentId: string) =>
      request(
        `/admin/payments/${paymentId}/refunds`,
        { amountPaise: Math.round(Number(refundAmount) * 100), reason: refundReason },
        true,
        crypto.randomUUID(),
      ),
    onSuccess: () => {
      setRefundAmount("");
      setRefundReason("");
      void trace.refetch();
    },
  });
  const error =
    send.error ??
    login.error ??
    transactions.error ??
    trace.error ??
    refund.error ??
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
                      <p>
                        Captured ₹
                        {(trace.data.payment.capturedPaise / 100).toFixed(2)} ·
                        Released ₹
                        {(trace.data.payment.releasedPaise / 100).toFixed(2)}
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
                      <h4>Refunds</h4>
                      {trace.data.payment.refunds.length === 0 && (
                        <p>No refunds issued.</p>
                      )}
                      {trace.data.payment.refunds.map((item) => (
                        <p key={item.id}>
                          {new Date(item.createdAt).toLocaleTimeString()} · ₹
                          {(item.amountPaise / 100).toFixed(2)} · {item.state}
                          {item.reason ? ` · ${item.reason}` : ""}
                        </p>
                      ))}
                      {trace.data.payment.state === "SETTLED" && (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            refund.mutate(trace.data!.payment!.id);
                          }}
                        >
                          <label>
                            Refund amount (₹)
                            <input
                              value={refundAmount}
                              onChange={(event) =>
                                setRefundAmount(event.target.value)
                              }
                              inputMode="decimal"
                            />
                          </label>
                          <label>
                            Reason
                            <input
                              value={refundReason}
                              onChange={(event) =>
                                setRefundReason(event.target.value)
                              }
                            />
                          </label>
                          <button
                            disabled={
                              refund.isPending ||
                              !refundAmount.trim() ||
                              !refundReason.trim()
                            }
                          >
                            Issue refund
                          </button>
                        </form>
                      )}
                    </>
                  ) : (
                    <p>No payment has been initiated.</p>
                  )}
                  <h3>Charging session</h3>
                  {trace.data.order?.fulfillment?.session ? (
                    <>
                      <p>
                        {trace.data.order.fulfillment.session.state} ·{" "}
                        {(
                          trace.data.order.fulfillment.session.energyWh / 1000
                        ).toFixed(3)}{" "}
                        kWh
                        {trace.data.order.fulfillment.session.startedAt
                          ? ` · started ${new Date(trace.data.order.fulfillment.session.startedAt).toLocaleTimeString()}`
                          : ""}
                        {trace.data.order.fulfillment.session.endedAt
                          ? ` · ended ${new Date(trace.data.order.fulfillment.session.endedAt).toLocaleTimeString()}`
                          : ""}
                      </p>
                      {trace.data.order.fulfillment.session.events.map(
                        (event) => (
                          <p key={event.id}>
                            {new Date(event.createdAt).toLocaleTimeString()} ·{" "}
                            {event.kind}
                          </p>
                        ),
                      )}
                    </>
                  ) : (
                    <p>No charging session has started.</p>
                  )}
                  <h3>Invoice</h3>
                  {trace.data.order?.invoice ? (
                    <p>
                      {trace.data.order.invoice.state} ·{" "}
                      {(trace.data.order.invoice.energyWh / 1000).toFixed(3)}{" "}
                      kWh · Subtotal ₹
                      {(trace.data.order.invoice.subtotalPaise / 100).toFixed(
                        2,
                      )}{" "}
                      · Tax ₹
                      {(trace.data.order.invoice.taxPaise / 100).toFixed(2)} ·
                      Total ₹
                      {(trace.data.order.invoice.totalPaise / 100).toFixed(2)}
                    </p>
                  ) : (
                    <p>No invoice has been issued.</p>
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
