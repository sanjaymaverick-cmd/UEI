import { NavLink, Outlet } from "react-router-dom";
import { currentUser, logout } from "./api";
import { useState } from "react";

export type AccountContext = {
  user: ReturnType<typeof currentUser>;
  setUser: (user: ReturnType<typeof currentUser>) => void;
};
const links = [
  { to: "/", label: "Home" },
  { to: "/locator", label: "Find a charger" },
  { to: "/community", label: "Community" },
  { to: "/business", label: "For businesses" },
  { to: "/about", label: "About" },
];

export function Layout() {
  const [user, setUser] = useState(currentUser());
  return (
    <>
      <header className="topbar">
        <div className="shell">
          <NavLink to="/" className="brand">
            <span className="mark">P</span>
            PlugMitra
          </NavLink>
          <nav className="navlinks">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => (isActive ? "active" : "")}
                end={link.to === "/"}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="account">
            {user ? (
              <>
                <span>{user.email}</span>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    void logout().then(() => setUser(null));
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <span>Not signed in</span>
            )}
          </div>
        </div>
      </header>
      <Outlet context={{ user, setUser }} />
      <footer>
        <div className="shell footer">
          <span>© {new Date().getFullYear()} PlugMitra</span>
          <span>Built on the UEI charging network</span>
        </div>
      </footer>
    </>
  );
}
