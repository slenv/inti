import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Coins,
  Download,
  FileSpreadsheet,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslation, type Locale } from "@/lib/i18n";
import Logo from "@/components/Logo";

const LANGUAGE_SELECTOR = ["es", "en"] as Locale[];

function LanguageSelector() {
  const { locale, setLocale } = useTranslation();
  return (
    <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-full p-1">
      {LANGUAGE_SELECTOR.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${locale === l ? "bg-white text-accent shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          {l === "es" ? "Español" : "English"}
        </button>
      ))}
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    { icon: Users, title: t("landing.featShared"), desc: t("landing.featSharedDesc"), tint: "bg-accent-light text-accent" },
    { icon: Wallet, title: t("landing.featAccounts"), desc: t("landing.featAccountsDesc"), tint: "bg-mint-light text-income" },
    { icon: Receipt, title: t("landing.featTrack"), desc: t("landing.featTrackDesc"), tint: "bg-peach-light text-expense" },
    { icon: BarChart3, title: t("landing.featGraphs"), desc: t("landing.featGraphsDesc"), tint: "bg-mint-light text-income" },
    { icon: Coins, title: t("landing.featCurrency"), desc: t("landing.featCurrencyDesc"), tint: "bg-accent-light text-accent" },
    { icon: FileSpreadsheet, title: t("landing.featExport"), desc: t("landing.featExportDesc"), tint: "bg-peach-light text-expense" },
  ];

  const steps = [
    { num: "1", title: t("landing.how1"), desc: t("landing.how1Desc") },
    { num: "2", title: t("landing.how2"), desc: t("landing.how2Desc") },
    { num: "3", title: t("landing.how3"), desc: t("landing.how3Desc") },
  ];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-bold text-gray-800">{t("app.name")}</span>
          <span className="text-xs text-gray-400 hidden sm:block">{t("app.tagline")}</span>
          <LanguageSelector />
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 pt-12 pb-8 text-center animate-fade-in-up">
        <Logo className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white p-3 shadow-lg shadow-accent/20" />
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 leading-tight">
          {t("landing.heroTitle")}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 mt-4 max-w-xl mx-auto leading-relaxed">
          {t("landing.heroSub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link to="/login" state={{ register: true }} className="btn-primary sm:w-auto sm:px-8 flex items-center justify-center gap-2">
            {t("landing.ctaStart")} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="btn-secondary sm:w-auto sm:px-8 flex items-center justify-center gap-2">
            {t("landing.ctaLogin")}
          </Link>
          <Link to="/install" className="sm:w-auto sm:px-8 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors text-sm font-semibold">
            <Download className="w-4 h-4" /> {t("landing.ctaInstall")}
          </Link>
        </div>
      </section>

      <section id="features" className="max-w-3xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 animate-fade-in-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.tint}`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-800 text-sm">{f.title}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-xl font-bold text-gray-800 text-center mb-6">{t("landing.howTitle")}</h2>
        <div className="space-y-4">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 animate-fade-in-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm shrink-0">
                {s.num}
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{s.title}</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-gradient-to-r from-accent to-accent-hover rounded-3xl p-8 text-center text-white shadow-lg shadow-accent/30">
          <h2 className="text-xl font-bold">{t("landing.installTitle")}</h2>
          <p className="text-sm mt-2 opacity-90 leading-relaxed max-w-md mx-auto">{t("landing.installDesc")}</p>
          <Link
            to="/install"
            className="inline-flex items-center gap-2 mt-5 bg-white text-accent font-semibold text-sm rounded-xl px-6 py-3 shadow hover:bg-accent-light transition-colors"
          >
            <Download className="w-4 h-4" /> {t("landing.ctaInstall")}
          </Link>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-4 py-8 text-center">
        <p className="text-xs text-gray-400">{t("landing.footer")}</p>
        <p className="text-[11px] text-gray-300 mt-1">
          {t("app.name")} — {t("app.tagline")}
        </p>
      </footer>
    </div>
  );
}