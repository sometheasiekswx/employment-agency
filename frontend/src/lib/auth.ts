/** Hosted Google PKCE authentication. Never modifies the browser's global fetch. */
interface AuthConfig {
  url: string;
  key: string;
}
interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
const SESSION_KEY = "ea-cloud-session";
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export class HostedAuth {
  private session: Session | null = null;
  private refreshing?: Promise<void>;
  constructor(private config: AuthConfig) {}

  private async exchange(path: string, body: object): Promise<TokenResponse> {
    const response = await fetch(`${this.config.url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.config.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        "Google session could not be established. Please sign in again.",
      );
    return response.json();
  }

  private save(value: TokenResponse) {
    this.session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: Date.now() + value.expires_in * 1000,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
  }

  async initialize() {
    const params = new URLSearchParams(location.search);
    if (params.has("error")) {
      history.replaceState(null, "", location.pathname);
      throw new Error("Google sign-in was not completed. Please try again.");
    }
    if (params.has("code")) {
      const verifier = sessionStorage.getItem("ea-pkce");
      const code = params.get("code");
      history.replaceState(null, "", location.pathname);
      if (!verifier) throw new Error("Sign in again from this browser.");
      this.save(
        await this.exchange("token?grant_type=pkce", {
          auth_code: code,
          code_verifier: verifier,
        }),
      );
      sessionStorage.removeItem("ea-pkce");
    } else {
      try {
        this.session = JSON.parse(
          sessionStorage.getItem(SESSION_KEY) || "null",
        );
      } catch {
        this.session = null;
      }
    }
    return Boolean(this.session?.access_token && this.session.refresh_token);
  }

  async access() {
    if (!this.session) throw new Error("Sign in again.");
    if (this.session.expires_at < Date.now() + 60_000) {
      this.refreshing ??= this.exchange("token?grant_type=refresh_token", {
        refresh_token: this.session.refresh_token,
      })
        .then((value) => this.save(value))
        .finally(() => {
          this.refreshing = undefined;
        });
      await this.refreshing;
    }
    return this.session.access_token;
  }

  async login() {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem("ea-pkce", verifier);
    const challenge = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    const url = new URL(`${this.config.url}/auth/v1/authorize`);
    Object.entries({
      provider: "google",
      redirect_to: `${location.origin}/`,
      code_challenge: challenge,
      code_challenge_method: "s256",
    }).forEach(([key, value]) => url.searchParams.set(key, value));
    location.assign(url);
  }

  clear() {
    this.session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  async logout() {
    const response = await fetch(`${this.config.url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: this.config.key,
        Authorization: `Bearer ${await this.access()}`,
      },
    });
    if (!response.ok) throw new Error("Sign out failed. Please try again.");
    this.clear();
  }
}
