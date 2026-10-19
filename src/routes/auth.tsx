import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — District Ride" },
      { name: "description", content: "Sign in to District Ride with your mobile number." },
      { property: "og:title", content: "Sign in — District Ride" },
      { property: "og:description", content: "Mobile number sign-in for passengers and drivers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function toE164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleInstantLogin(e: React.FormEvent) {
  e.preventDefault();
  const e164 = toE164(phone);
  if (!/^\+923\d{9}$/.test(e164)) {
    return void toast.error("Enter a valid mobile number, e.g. 0300 1234567");
  }

  setBusy(true);
  const syntheticEmail = `${e164.replace("+", "")}@districtride.test`;
  const syntheticPassword = `pwd_${e164.replace("+", "")}`;

  // Try signing in
  let { data, error } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });

  // If user does not exist, create the account automatically
  if (error && error.message.includes("Invalid login credentials")) {
    const signUpRes = await supabase.auth.signUp({
      email: syntheticEmail,
      password: syntheticPassword,
      options: { data: { phone: e164 } },
    });
    error = signUpRes.error;
    data = signUpRes.data;
  }

  setBusy(false);

  if (error) {
    return void toast.error(error.message);
  }

  toast.success("Signed in successfully!");
  navigate({ to: "/app", replace: true });
}

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-16">
      <h1 className="text-3xl font-extrabold text-primary">District Ride</h1>
      {!sent ? (
        <form onSubmit={sendCode} className="mt-10 space-y-4">
          <h2 className="text-xl font-bold">Enter your mobile number</h2>
          <div className="flex gap-2">
            <div className="flex h-13 items-center rounded-2xl border bg-card px-4 font-semibold">+92</div>
            <Input
              inputMode="tel"
              autoFocus
              placeholder="300 1234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-13 rounded-2xl bg-card text-lg"
            />
          </div>
          <Button type="submit" size="xl" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <div className="mt-10 space-y-6">
          <div>
            <h2 className="text-xl font-bold">Enter the 6-digit code</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sent to {sent}</p>
          </div>
          <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={verify}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="h-13 w-12 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button size="xl" onClick={verify} disabled={busy || code.length !== 6}>
            {busy ? "Verifying…" : "Verify"}
          </Button>
          <button className="text-sm font-semibold text-primary" onClick={() => setSent(null)}>
            Change number
          </button>
        </div>
      )}
    </main>
  );
}
