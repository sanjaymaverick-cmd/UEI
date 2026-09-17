import { useEffect, useRef } from "react";

interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}
interface GoogleButtonConfiguration {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  shape?: "rectangular" | "pill" | "circle" | "square";
  text?: "signin_with" | "signup_with" | "continue_with";
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: GoogleIdConfiguration): void;
          renderButton(
            parent: HTMLElement,
            options: GoogleButtonConfiguration,
          ): void;
        };
      };
    };
  }
}

export function GoogleButton({
  onToken,
}: {
  onToken: (idToken: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
      | string
      | undefined;
    if (!clientId || !ref.current) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (!window.google) {
        if (attempts > 40) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onToken(response.credential),
      });
      if (ref.current)
        window.google.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "signin_with",
        });
    }, 100);
    return () => clearInterval(timer);
  }, [onToken]);
  return <div ref={ref} />;
}
