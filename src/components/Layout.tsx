import Logo from "@/components/Logo";
import ProfileMenu from "@/components/ProfileMenu";
import { useTranslation } from "@/lib/i18n";
import { Home, List, PlusCircle, User, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", icon: Home, labelKey: "nav.home" as const },
  { to: "/transactions", icon: List, labelKey: "nav.transactions" as const },
  { to: "/add", icon: PlusCircle, labelKey: "nav.add" as const, accent: true },
  { to: "/spaces", icon: Users, labelKey: "nav.spaces" as const },
  { to: "/profile", icon: User, labelKey: "nav.profile" as const },
];

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#1A1D27] border-r border-gray-100 dark:border-white/10 shadow-sm z-30">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100 dark:border-white/10">
          <div className="w-9 h-9 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center">
            <Logo className="w-7 h-7" />
          </div>
          <span className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {t("app.name")}
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-gray-200"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100 dark:border-white/10">
          <ProfileMenu variant="sidebar" />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden bg-white dark:bg-[#1A1D27] border-b border-gray-100 dark:border-white/10 shadow-sm safe-area-top">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/5 flex items-center justify-center">
              <Logo className="w-6 h-6" />
            </div>
            <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {t("app.name")}
            </span>
          </button>
          <ProfileMenu />
        </div>
      </header>

      <main className="flex-1 lg:ml-64 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pt-6 lg:pb-6">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#12141A] border-t border-gray-200 dark:border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] safe-area-bottom">
        <div className="max-w-md mx-auto grid grid-cols-5 items-center px-2 pt-1.5 pb-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-colors ${
                  item.accent
                    ? ""
                    : isActive
                      ? "text-accent"
                      : "text-gray-400 dark:text-gray-500"
                }`
              }
            >
              {item.accent ? (
                <span className="w-12 h-12 -mt-7 rounded-2xl bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/40 border-4 border-white dark:border-[#12141A] active:scale-95 transition-transform">
                  <item.icon className="w-6 h-6" />
                </span>
              ) : (
                <item.icon className="w-[22px] h-[22px]" />
              )}
              <span
                className={`text-[10px] font-semibold ${item.accent ? "text-accent" : ""}`}
              >
                {t(item.labelKey)}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
