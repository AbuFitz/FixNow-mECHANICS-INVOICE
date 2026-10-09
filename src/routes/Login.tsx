import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button, TextField } from "@/components/ui";
import { api } from "@/lib/api";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  return (
    <div className="grid min-h-dvh place-items-center bg-ink px-5">
      <div className="hazard fixed inset-x-0 top-0 h-1.5" />
      <form
        className="rise-in w-full max-w-sm rounded-3xl bg-card p-6 shadow-lift"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.auth.signIn(email, password);
            nav(loc.state?.from ?? "/", { replace: true });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't sign in.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo dark className="text-2xl" />
        <p className="eyebrow mt-2 text-muted-foreground">Billing &amp; accounts · staff only</p>
        <div className="mt-6 space-y-4">
          <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          <Button type="submit" variant="signal" size="lg" className="w-full" loading={busy}>
            Sign in
          </Button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Uses the same staff login as FixNow Tracking.</p>
      </form>
    </div>
  );
}
