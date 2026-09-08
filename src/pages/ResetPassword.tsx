import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";
import Logo from "@/components/Logo";

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "invalid">("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const email = params.get("email") ?? "";
      let ok = false;
      if (tokenHash && type === "recovery") {
        const { error: err } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
          email,
        });
        ok = !err;
      }
      if (!ok) {
        const { data } = await supabase.auth.getSession();
        ok = !!data.session?.user;
      }
      if (!active) return;
      setStatus(ok ? "ready" : "invalid");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("profile.passwordShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("profile.passwordMismatch"));
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    await supabase.auth.signOut();
    setTimeout(() => navigate("/login", { replace: true }), 2200);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="text-center mb-6 animate-fade-in-up">
          <Logo className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white  p-2" />
          <h1 className="text-2xl font-bold text-gray-800">{t("app.name")}</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 text-left animate-fade-in-up">
          {status === "loading" && (
            <p className="text-sm text-gray-500 text-center py-6 flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </p>
          )}

          {status === "invalid" && (
            <div className="text-center space-y-4">
              <p className="text-sm text-expense flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {t("auth.resetInvalid")}
              </p>
              <button
                onClick={() => navigate("/login", { replace: true })}
                className="btn-primary flex items-center justify-center gap-2 w-full"
              >
                <ArrowLeft className="w-4 h-4" /> {t("auth.backLogin")}
              </button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800 text-center flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-accent" /> {t("auth.resetTitle")}
              </h2>
              {done && (
                <div className="flex items-start gap-3 bg-income-light border border-income/20 text-income text-sm rounded-xl px-4 py-3">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{t("auth.resetDone")}</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-3 bg-expense-light border border-expense/20 text-expense text-sm rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t("profile.newPassword")}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={done}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t("profile.confirmPassword")}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={done}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy || done}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {done ? (
                  <span className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> {t("common.saving")}
                  </span>
                ) : busy ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  t("auth.updatePassword")
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}