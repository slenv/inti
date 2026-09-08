import Logo from "@/components/Logo";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/seo";
import { supabase } from "@/lib/supabase";
import { ensureUserData } from "@/lib/userSetup";
import { useAppStore } from "@/store/useAppStore";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

function getPasswordLevel(pw: string): number {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 6) s += 1;
  if (pw.length >= 9) s += 1;
  if (/[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  return Math.min(s, 4);
}

export default function Login() {
  const { t } = useTranslation();
  const location = useLocation();
  usePageMeta(`${t("app.name")} – ${t("auth.loginTitle")}`);
  const [isRegister, setIsRegister] = useState(
    (location.state as { register?: boolean } | null)?.register ?? false
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setProfile, setSpaces } = useAppStore();

  useEffect(() => {
    if (isRegister) nameRef.current?.focus();
    else emailRef.current?.focus();
  }, [isRegister]);

  const emailValid = isRegister && EMAIL_RE.test(email);
  const nameValid = isRegister && name.trim().length > 0;
  const passwordValid = isRegister && password.length >= MIN_PASSWORD;
  const level = getPasswordLevel(password);

  const strengthMeta =
    level <= 1
      ? { color: "#DC2626", label: level === 0 ? "" : t("auth.passwordWeak") }
      : level <= 3
        ? { color: "#F59E0B", label: t("auth.passwordMedium") }
        : { color: "#16A34A", label: t("auth.passwordStrong") };

  function fail(message: string) {
    setError(message);
    setShakeTrigger((x) => x + 1);
    setLoading(false);
  }

  async function enterApp(userId: string, fallbackName?: string) {
    const { profile, spaces } = await ensureUserData(userId, fallbackName);
    setProfile(profile);
    setSpaces(spaces as any);
    navigate("/", { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!nameValid) return fail(t("auth.nameRequired"));
        if (!EMAIL_RE.test(email)) return fail(t("auth.invalidEmail"));
        if (password.length < MIN_PASSWORD)
          return fail(t("auth.passwordTooShort"));

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
          },
        });

        if (signUpError) {
          if (signUpError.message.includes("already registered"))
            return fail(t("auth.alreadyRegistered"));
          if (signUpError.message.includes("valid email"))
            return fail(t("auth.invalidEmail"));
          if (signUpError.message.includes("at least 6"))
            return fail(t("auth.passwordTooShort"));
          return fail(signUpError.message);
        }

        if (data.session) {
          if (data.user) await enterApp(data.user.id, name);
        } else if (data.user && data.user.identities && data.user.identities.length === 0) {
          return fail(t("auth.alreadyRegistered"));
        } else {
          setRegisteredEmail(email);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          if (signInError.message.includes("Invalid login"))
            return fail(t("auth.loginInvalid"));
          if (signInError.message.includes("Email not confirmed"))
            return fail(t("auth.emailNotConfirmed"));
          if (signInError.message.includes("Too many"))
            return fail(t("auth.tooManyAttempts"));
          return fail(signInError.message);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await enterApp(session.user.id, email.split("@")[0]);
        }
      }
    } catch (err: any) {
      if (
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        fail(t("auth.connectionError"));
      } else {
        fail(err.message || t("auth.unexpectedError"));
      }
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setIsRegister(!isRegister);
    setError(null);
    setRegisteredEmail(null);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(forgotEmail)) return fail(t("auth.invalidEmail"));
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
    } catch (err: any) {
      if (
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("NetworkError")
      ) {
        fail(t("auth.connectionError"));
      } else {
        fail(err.message || t("auth.unexpectedError"));
      }
    } finally {
      setLoading(false);
    }
  }

  if (registeredEmail) {
if (forgotSent) {
    return (
      <div className="min-h-dvh flex items-center justify-center py-8">
        <div className="w-full max-w-sm text-center animate-fade-in-up">
          <Logo className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white  p-2" />
          <div className="w-14 h-14 rounded-full bg-income-light flex items-center justify-center mx-auto mb-4">
            <MailCheck className="w-7 h-7 text-income animate-pop-in" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            {t("auth.resetSent")}
          </h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {t("auth.resetSentDesc", { email: forgotEmail })}
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => {
                setForgotSent(false);
                setShowForgot(false);
                setForgotEmail("");
              }}
              className="btn-primary flex items-center justify-center gap-2 w-full"
            >
              {t("auth.backLogin")}
            </button>
            <p className="text-xs text-gray-400">{t("auth.checkEmailHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-dvh flex items-center justify-center py-8">
        <div className="w-full max-w-sm text-center animate-fade-in-up">
          <Logo className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white  p-2" />
          <div className="w-14 h-14 rounded-full bg-income-light flex items-center justify-center mx-auto mb-4">
            <MailCheck className="w-7 h-7 text-income animate-pop-in" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            {t("auth.checkEmail")}
          </h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            {t("auth.checkEmailDesc", { email: registeredEmail })}
          </p>
          <div className="mt-6 space-y-3">
            <button
              onClick={() => {
                setRegisteredEmail(null);
                setIsRegister(false);
                setEmail(registeredEmail);
              }}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {t("auth.goLogin")}
            </button>
            <p className="text-xs text-gray-400">{t("auth.checkEmailHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 animate-fade-in-up">
          <Logo className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white  p-2" />
          <h1 className="text-3xl font-bold text-gray-800">{t("app.name")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("app.tagline")}</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-6 space-y-4 animate-fade-in-up">
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => isRegister && toggleMode()}
              className={`py-2 rounded-xl text-sm font-semibold transition-colors ${!isRegister ? "bg-white text-accent shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t("auth.login")}
            </button>
            <button
              type="button"
              onClick={() => !isRegister && toggleMode()}
              className={`py-2 rounded-xl text-sm font-semibold transition-colors ${isRegister ? "bg-white text-accent shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t("auth.register")}
            </button>
          </div>

          {showForgot ? (
          <form
            key="forgot"
            onSubmit={handleForgot}
            className="space-y-4 animate-fade-in-up"
          >
            {error && (
              <div
                key={`forgot-${shakeTrigger}`}
                className="animate-shake flex items-start gap-3 bg-expense-light border border-expense/20 text-expense text-sm rounded-xl px-4 py-3"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <p className="text-sm text-gray-500 leading-relaxed">{t("auth.resetHint")}</p>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                placeholder={t("auth.email")}
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                autoFocus
                required
                autoComplete="email"
                inputMode="email"
                className="input-field"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t("auth.sending")}
                </>
              ) : (
                t("auth.sendResetLink")
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForgot(false);
                setError(null);
              }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {t("auth.backLogin")}
            </button>
          </form>
        ) : (
          <form
            key={isRegister ? "register" : "login"}
            onSubmit={handleSubmit}
            className="space-y-4 animate-fade-in-up"
          >
            {error && (
              <div
                key={shakeTrigger}
                className="animate-shake flex items-start gap-3 bg-expense-light border border-expense/20 text-expense text-sm rounded-xl px-4 py-3"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isRegister && (
              <div className="relative animate-fade-in-up">
                <User
                  className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${nameValid ? "text-income" : "text-gray-400"}`}
                />
                <input
                  ref={nameRef}
                  type="text"
                  placeholder={t("auth.name")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className={`input-field ${nameValid ? "valid" : ""}`}
                />
              </div>
            )}

            <div className="relative">
              <Mail
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${emailValid ? "text-income" : "text-gray-400"}`}
              />
              <input
                ref={emailRef}
                type="email"
                placeholder={t("auth.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                className={`input-field ${emailValid ? "valid" : ""}`}
              />
            </div>

            <div className="relative">
              <Lock
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${passwordValid ? "text-income" : "text-gray-400"}`}
              />
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                autoComplete={isRegister ? "new-password" : "current-password"}
                className={`input-field pr-11 ${passwordValid ? "valid" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
                aria-label={
                  showPassword ? t("auth.hidePassword") : t("auth.showPassword")
                }
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {isRegister && password && (
              <div className="animate-fade-in-up">
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 flex-1 rounded-full transition-all duration-300 animate-bar-grow"
                      style={{
                        backgroundColor:
                          i < level ? strengthMeta.color : "#E5E7EB",
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-gray-400">
                    {t("common.min6")}
                  </p>
                  {level > 0 && (
                    <p
                      className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                      style={{ color: strengthMeta.color }}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {strengthMeta.label}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isRegister ? t("auth.registering") : t("auth.loggingIn")}
                </>
              ) : isRegister ? (
                t("auth.register")
              ) : (
                t("auth.login")
              )}
            </button>
            {!isRegister && !loading && (
              <button
                type="button"
                onClick={() => {
                  setShowForgot(true);
                  setError(null);
                }}
                className="w-full text-center text-xs text-accent font-medium hover:underline transition-colors"
              >
                {t("auth.forgot")}
              </button>
            )}
          </form>
        )}

        <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-gray-400">
                {t("common.or")}
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-gray-500">
            {isRegister ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
            <button
              type="button"
              onClick={toggleMode}
              className="text-accent font-semibold hover:underline"
            >
              {isRegister ? t("auth.login") : t("auth.registerFree")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
