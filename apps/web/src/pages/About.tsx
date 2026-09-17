import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { request } from "../api";

export function About() {
  const [kind, setKind] = useState<"INVESTOR" | "CONTACT">("CONTACT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const submit = useMutation({
    mutationFn: () => request("/leads", { kind, name, email, message: message.trim() || undefined }),
  });
  return (
    <>
      <section className="section shell">
        <h2>About PlugMitra</h2>
        <p className="lede">
          PlugMitra is India's charging companion — built on UEI, an open
          Beckn-ONIX network that lets any compatible provider's chargers show
          up in one search, instead of locking drivers into a single app per
          network.
        </p>
        <div className="grid-3">
          <div className="card">
            <h3>Our vision</h3>
            <p>
              Every charger in India, searchable from one place, backed by
              reviews from drivers who've actually used it.
            </p>
          </div>
          <div className="card">
            <h3>Open by design</h3>
            <p>
              Built on the Beckn-ONIX protocol so charging point operators
              plug in without being tied to a single closed platform.
            </p>
          </div>
          <div className="card">
            <h3>Community-first</h3>
            <p>
              Reviews and check-ins come from real drivers, not paid listings
              — that's the "Mitra" in PlugMitra.
            </p>
          </div>
        </div>
      </section>
      <section className="band section">
        <div className="shell">
          <h2>Get in touch</h2>
          <p className="lede" style={{ color: "rgba(255,255,255,0.75)" }}>
            Investor, press, or just have a question — send us a note.
          </p>
          {submit.isSuccess ? (
            <p className="notice success">Thanks — we'll be in touch soon.</p>
          ) : (
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
            >
              <label>
                I am a…
                <select value={kind} onChange={(event) => setKind(event.target.value as "INVESTOR" | "CONTACT")}>
                  <option value="CONTACT">Driver / general enquiry</option>
                  <option value="INVESTOR">Investor or press</option>
                </select>
              </label>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Message
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  required
                />
              </label>
              <button className="btn btn-primary" disabled={submit.isPending}>
                Send message
              </button>
              {submit.isError && (
                <p className="notice error">{(submit.error as Error).message}</p>
              )}
            </form>
          )}
        </div>
      </section>
    </>
  );
}
