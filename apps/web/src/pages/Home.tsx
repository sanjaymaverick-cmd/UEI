import { Link } from "react-router-dom";

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="shell">
          <div>
            <span className="eyebrow">BUILT FOR INDIAN EV DRIVERS</span>
            <h1>
              Find a charger. <em>Trust</em> a charger. Share a charger.
            </h1>
            <p>
              PlugMitra is your charging companion — search live stations on
              the UEI network, read reviews from drivers who've actually
              charged there, and help other drivers do the same.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/locator">
                Find a charger near me
              </Link>
              <Link className="btn btn-ghost" to="/community">
                Browse reviews
              </Link>
            </div>
          </div>
          <div className="hero-card">
            <h3>Why drivers use PlugMitra</h3>
            <div className="stat-row">
              <div className="stat">
                <strong>Live</strong>
                <span>Search results</span>
              </div>
              <div className="stat">
                <strong>Real</strong>
                <span>Driver reviews</span>
              </div>
              <div className="stat">
                <strong>UPI</strong>
                <span>Pay in-app</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section shell">
        <h2>Everything a charging trip needs</h2>
        <p className="lede">
          One companion for drivers, station operators, and the people
          backing India's charging network.
        </p>
        <div className="grid-3">
          <div className="card">
            <div className="icon" style={{ background: "var(--orange)" }}>
              ⚡
            </div>
            <h3>Locator</h3>
            <p>
              Search compatible chargers near you on the live UEI network and
              see them plotted on a map, with connector type and price.
            </p>
          </div>
          <div className="card">
            <div className="icon" style={{ background: "var(--indigo)" }}>
              🤝
            </div>
            <h3>Community</h3>
            <p>
              Every station carries reviews from drivers who charged there —
              add your own after a search to help the next driver decide.
            </p>
          </div>
          <div className="card">
            <div className="icon" style={{ background: "#c33b8f" }}>
              🏢
            </div>
            <h3>For businesses</h3>
            <p>
              Running a charging point? List your stations on PlugMitra and
              reach drivers actively searching nearby.
            </p>
          </div>
        </div>
      </section>
      <section className="band section">
        <div className="shell">
          <h2>Building India's most trusted charging network</h2>
          <p className="lede" style={{ color: "rgba(255,255,255,0.75)" }}>
            PlugMitra runs on UEI's Beckn-ONIX charging protocol — open,
            interoperable, and built to work across providers rather than
            locking drivers into one network.
          </p>
          <Link className="btn btn-primary" to="/about">
            Read more about PlugMitra
          </Link>
        </div>
      </section>
    </>
  );
}
