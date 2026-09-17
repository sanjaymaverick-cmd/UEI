import { useState } from "react";
import { GoogleButton } from "./GoogleButton";
import { currentUser, loginWithGoogle } from "./api";
import type { AccountContext } from "./Layout";

export function SignInPanel({
  message,
  setUser,
}: {
  message: string;
  setUser: AccountContext["setUser"];
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <p className="lede" style={{ marginBottom: 16 }}>
        {message}
      </p>
      <GoogleButton
        onToken={(idToken) => {
          void loginWithGoogle(idToken)
            .then(() => setUser(currentUser()))
            .catch((err: Error) => setError(err.message));
        }}
      />
      {error && <p className="notice error">{error}</p>}
    </div>
  );
}
