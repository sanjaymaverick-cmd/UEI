import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { request } from "../api";

export function Business() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      request("/leads", {
        kind: "CPO",
        name,
        email,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        message: message.trim() || undefined,
      }),
  });
  return (
    <section className="section shell">
      <h2>List your charging stations</h2>
      <p className="lede">
        Charging point operators can list stations on PlugMitra and reach
        drivers who are actively searching nearby on the UEI network.
      </p>
      {submit.isSuccess ? (
        <p className="notice success">
          Thanks — our team will reach out to onboard your stations shortly.
        </p>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <label>
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Phone (optional)
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            Company
            <input value={company} onChange={(event) => setCompany(event.target.value)} required />
          </label>
          <label>
            Tell us about your stations (optional)
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              placeholder="Number of stations, cities, connector types…"
            />
          </label>
          <button className="btn btn-primary" disabled={submit.isPending}>
            Request a partnership
          </button>
          {submit.isError && (
            <p className="notice error">{(submit.error as Error).message}</p>
          )}
        </form>
      )}
    </section>
  );
}
