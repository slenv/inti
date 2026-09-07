import ChartErrorBoundary from "@/components/ChartErrorBoundary";
import EmptyState from "@/components/EmptyState";
import PeriodSelector from "@/components/PeriodSelector";
import PhotoLightbox from "@/components/PhotoLightbox";
import SwipeableRow from "@/components/SwipeableRow";
import { finishProgress, startProgress } from "@/components/TopProgress";
import UserBubble from "@/components/UserBubble";
import TransactionDetailModal from "./TransactionDetail";
import { useTranslation } from "@/lib/i18n";
import {
  ACCOUNT_TYPE_ICONS,
  DEFAULT_COLOR,
  getIcon,
  isImageIcon,
  resolveIconSrc,
} from "@/lib/icons";
import {
  periodRange,
  queryRange,
  trendRange,
  type PeriodRange,
} from "@/lib/period";
import {
  getShareScope,
  getUserOwners,
  groupByUser,
  type SpaceOwnerSummary,
} from "@/lib/shared";
import { computeFlowTotals } from "@/lib/flow";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { format, subMonths } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Settings,
  Sun,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const CategoryDonut = lazy(() =>
  import("@/components/Charts").then((m) => ({ default: m.CategoryDonut })),
);
const MonthlyBars = lazy(() =>
  import("@/components/Charts").then((m) => ({ default: m.MonthlyBars })),
);

const PIE_COLORS = [
  "#8B72D4",
  "#4ADE80",
  "#FFD3B0",
  "#DC2626",
  "#16A34A",
  "#2563EB",
  "#EAB308",
  "#EA580C",
];

interface DashboardCache {
  transactions: any[];
  accounts: any[];
  ownersById: Map<string, SpaceOwnerSummary>;
  scope: string[];
  allowedAccounts: Set<string>;
  isShared: boolean;
  loadedSpaceId: string | null;
}

const dashboardCacheKey = (spaceId: string | null) => `dashboard:${spaceId ?? "none"}`;

export default function Dashboard() {
  const { t, locale } = useTranslation();
  const { profile, spaces, activeSpaceId, period, setPeriod } = useAppStore();
  const navigate = useNavigate();
  const cached = sessionData.get<DashboardCache>(dashboardCacheKey(activeSpaceId));
  const [transactions, setTransactions] = useState<any[]>(cached?.transactions ?? []);
  const [accounts, setAccounts] = useState<any[]>(cached?.accounts ?? []);
  const [ownersById, setOwnersById] = useState<Map<string, SpaceOwnerSummary>>(
    cached?.ownersById ?? new Map(),
  );
  const [scope, setScope] = useState<string[]>(cached?.scope ?? []);
  const [allowedAccounts, setAllowedAccounts] = useState<Set<string>>(cached?.allowedAccounts ?? new Set());
  const [isShared, setIsShared] = useState(cached?.isShared ?? false);
  const [loading, setLoading] = useState(!cached);
  const [loadedSpaceId, setLoadedSpaceId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showBalanceConfig, setShowBalanceConfig] = useState(false);
  const [detailTx, setDetailTx] = useState<any | null>(null);
  const [excludedBySpace, setExcludedBySpace] = useState<Record<string, string[]>>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsError, setPrefsError] = useState(false);
  const lastSavedRef = useRef<Record<string, string[]> | null>(null);
  const exclusionsRef = useRef<Record<string, string[]>>({});

  async function persistExclusions(next: Record<string, string[]>) {
    if (!profile) return;
    lastSavedRef.current = next;
    exclusionsRef.current = next;
    setExcludedBySpace(next);
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: profile.id,
        excluded_balance_accounts: next,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[dashboard] save preferences", error);
      setPrefsError(true);
    }
  }

  // Preferencias por usuario: se cargan una sola vez, no por espacio.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("excluded_balance_accounts")
          .eq("user_id", profile.id)
          .maybeSingle();
        const raw = data?.excluded_balance_accounts;
        let parsed: Record<string, string[]> = {};
        if (Array.isArray(raw)) {
          parsed = raw.length ? { [activeSpaceId ?? "default"]: raw as string[] } : {};
        } else if (raw && typeof raw === "object") {
          parsed = raw as Record<string, string[]>;
        }
        setExcludedBySpace(parsed);
        lastSavedRef.current = parsed;
        exclusionsRef.current = parsed;
        setPrefsLoaded(true);
      } catch (err) {
        console.error("[dashboard] load preferences", err);
      }
    })();
  }, [profile?.id]);

  useEffect(() => {
    if (!profile || !prefsLoaded) return;
    if (JSON.stringify(excludedBySpace) === JSON.stringify(lastSavedRef.current)) return;
    lastSavedRef.current = excludedBySpace;
    supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: profile.id,
          excluded_balance_accounts: excludedBySpace,
        },
        { onConflict: "user_id" },
      )
      .then(({ error }) => {
        if (error) console.error("[dashboard] save preferences", error);
      });
  }, [profile?.id, excludedBySpace, prefsLoaded]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  const excludedAccounts = useMemo(
    () => new Set(excludedBySpace[activeSpaceId ?? ""] ?? []),
    [excludedBySpace, activeSpaceId],
  );

  const periodBounds = useMemo<PeriodRange | null>(
    () => periodRange(period, { weekStartsOn: locale === "es" ? 1 : 0 }),
    [period, locale],
  );

  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;

    // Arranca la descarga del chunk de gráficos YA, en paralelo con el fetch
    // de transacciones, en vez de esperar a que lleguen los datos para recién
    // ahí pedirlo. lazy() reutiliza esta promesa cuando la necesite.
    import("@/components/Charts");

    // Rango de la consulta: cuando el período es "todo" NO se acota por fecha
    // (el balance debe ser total), pero si hay período seleccionado se cubre
    // ese rango y además los últimos 4 meses para el gráfico de tendencia.
    const { from, to } = periodBounds
      ? queryRange(periodBounds, trendRange())
      : {};

    async function load() {
      // Refresco silencioso: si ya hay datos de este espacio, no mostrar skeleton.
      const existing = sessionData.get<DashboardCache>(dashboardCacheKey(spaceId));
      const isInitial = !existing;
      if (!isInitial) {
        setTransactions(existing.transactions);
        setAccounts(existing.accounts);
        setOwnersById(existing.ownersById);
        setScope(existing.scope);
        setAllowedAccounts(existing.allowedAccounts);
        setIsShared(existing.isShared);
        setLoadedSpaceId(spaceId);
        setLoading(false);
      } else {
        setLoading(true);
      }
      startProgress();
      try {
        const { scope: scopeIds, allowedAccounts: allowedIds } = await getShareScope(spaceId);
        setScope(scopeIds);
        const allowedSet = new Set(allowedIds);
        setAllowedAccounts(allowedSet);
        let query = supabase
          .from("transactions")
          .select(
            "*, profiles(name, color, avatar_url), categories(name, color, type, user_id), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
          )
          .in("space_id", scopeIds)
          .order("date", { ascending: false });
        if (from) query = query.gte("date", from);
        if (to) query = query.lte("date", to);
        const [txRes, accRes, ownersMap, membersRes] = await Promise.all([
          query,
          supabase
            .from("accounts")
            .select("id, user_id, name, icon, color, type")
            .order("created_at"),
          getUserOwners(),
          supabase
            .from("space_members")
            .select("user_id")
            .eq("space_id", spaceId),
        ]);
        if (txRes.error) setFetchError(t("dashboard.loadError"));
        else setFetchError(null);
        const txData = txRes.data ?? [];
        const hasOtherMembers = (membersRes.data ?? []).some(
          (m) => m.user_id !== profile?.id,
        );
        const filteredData =
          hasOtherMembers && allowedSet.size
            ? txData.filter(
                (tx) => allowedSet.has(tx.account_id) || (tx.to_account_id && allowedSet.has(tx.to_account_id)),
              )
            : txData;
        sessionData.set(dashboardCacheKey(spaceId), {
          transactions: filteredData,
          accounts: accRes.data ?? [],
          ownersById: ownersMap,
          scope: scopeIds,
          allowedAccounts: allowedSet,
          isShared: hasOtherMembers,
          loadedSpaceId: spaceId,
        });
        setIsShared(hasOtherMembers);
        setTransactions(filteredData);
        setAccounts(accRes.data ?? []);
        setOwnersById(ownersMap);
      } catch {
        setFetchError(t("dashboard.networkError"));
      } finally {
        setLoading(false);
        setLoadedSpaceId(spaceId);
        finishProgress();
      }
    }
    load();
  }, [activeSpaceId, period, periodBounds]);

  async function handleDeleteTx(id: string) {
    if (!confirm(t("transactions.deleteConfirm"))) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      console.error("[dashboard] delete", error);
      alert(t("transactions.deleteError"));
      return;
    }
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    setDetailTx(null);
  }

  // Transacciones del período seleccionado (o todas si es "desde siempre").
  const periodTx = useMemo(() => {
    if (!periodBounds) return transactions;
    return transactions.filter(
      (tx) => tx.date >= periodBounds.from && tx.date <= periodBounds.to,
    );
  }, [transactions, periodBounds]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const { income: totalIncome, expense: totalExpense } = useMemo(
    () =>
      computeFlowTotals(periodTx, {
        currentUserId: profile?.id,
        isShared,
        allowedAccounts,
        getAccount: (id) => accountsById.get(id),
      }),
    [periodTx, profile?.id, isShared, allowedAccounts, accountsById],
  );

  const accountBalances = useMemo(() => {
    const map: Record<string, number> = {};
    periodTx.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "transfer") {
        if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) - amt;
        if (tx.to_account_id)
          map[tx.to_account_id] = (map[tx.to_account_id] ?? 0) + amt;
      } else if (tx.type === "income") {
        if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) + amt;
      } else {
        if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) - amt;
      }
    });
    return accounts.map((a) => ({ ...a, balance: map[a.id] ?? 0 }));
  }, [accounts, periodTx]);

  const homeAccountBalances = isShared
    ? accountBalances.filter((a) => allowedAccounts.has(a.id))
    : accountBalances.filter((a) => a.user_id === profile?.id);

  const accountsTotal = homeAccountBalances
    .filter((a) => !excludedAccounts.has(a.id))
    .reduce((s, a) => s + a.balance, 0);

  const accountGroups = useMemo(
    () => groupByUser(homeAccountBalances, ownersById, profile?.id),
    [homeAccountBalances, ownersById, profile?.id],
  );

  const donutData = useMemo(() => {
    const totals = periodTx
      .filter((tx) => tx.type === "expense" && tx.categories)
      .reduce(
        (
          acc: Record<
            string,
            {
              id: string;
              name: string;
              value: number;
              color: string;
              owner: SpaceOwnerSummary | null;
            }
          >,
          tx,
        ) => {
          const catId = tx.category_id;
          if (!acc[catId]) {
            acc[catId] = {
              id: catId,
              name: tx.categories.name,
              value: 0,
              color:
                tx.categories.color ||
                PIE_COLORS[Object.keys(acc).length % PIE_COLORS.length],
              owner: ownersById.get(tx.categories.user_id) ?? null,
            };
          }
          acc[catId].value += Number(tx.amount);
          return acc;
        },
        {},
      );
    return Object.values(totals);
  }, [periodTx, ownersById]);

  const monthlyData = useMemo(() => {
    const months: { month: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthTx = transactions.filter((tx) => {
        const d = new Date(tx.date);
        return (
          d.getMonth() === monthDate.getMonth() &&
          d.getFullYear() === monthDate.getFullYear()
        );
      });
      const { income, expense } = computeFlowTotals(monthTx, {
        currentUserId: profile?.id,
        isShared,
        allowedAccounts,
        getAccount: (id) => accountsById.get(id),
      });
      months.push({
        month: format(monthDate, "MMM", {
          locale: locale === "es" ? esLocale : undefined,
        }),
        income,
        expense,
      });
    }
    return months;
  }, [transactions, locale, profile?.id, isShared, allowedAccounts, accountsById]);

  const currency = activeSpace?.currency ?? "PEN";

  if (loading || loadedSpaceId !== activeSpaceId) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-32 rounded bg-gray-100 animate-pulse" />
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50 space-y-3">
          <div className="h-10 w-24 rounded bg-gray-100 animate-pulse" />
          <div className="h-16 w-40 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
        <div className="h-48 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 rounded-full bg-expense-light flex items-center justify-center">
          <TrendingDown className="w-8 h-8 text-expense" />
        </div>
        <p className="text-sm text-gray-500 text-center">{fetchError}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary w-auto px-6"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!activeSpace) {
    return (
      <EmptyState
        title={t("dashboard.noSpace")}
        description={t("dashboard.noSpaceDesc")}
        action={
          <Link to="/spaces" className="btn-primary w-auto px-6">
            {t("dashboard.createSpace")}
          </Link>
        }
      />
    );
  }

  const ChartSkeleton = ({ height }: { height?: string }) => (
    <div
      className="flex items-center justify-center"
      style={{ height: height ?? "12rem" }}
    >
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{t("dashboard.welcome")}</p>
          <h1 className="text-xl font-bold text-gray-800">{profile?.name}</h1>
        </div>
        <SpaceSelector />
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      <div className="bg-gradient-to-br from-accent to-accent-hover rounded-2xl p-6 text-white shadow-lg shadow-accent/30">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm opacity-80">{t("dashboard.balance")}</p>
          <button
            type="button"
            onClick={() => setShowBalanceConfig(true)}
            aria-label={t("dashboard.accountsInBalance")}
            className="p-1.5 -m-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        <p className="text-3xl font-bold">
          {formatCurrency(accountsTotal, currency)}
        </p>
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-3 h-3" />
            </div>
            <span className="text-sm font-medium">
              {formatCurrency(totalIncome, currency)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <TrendingDown className="w-3 h-3" />
            </div>
            <span className="text-sm font-medium">
              {formatCurrency(totalExpense, currency)}
            </span>
          </div>
        </div>
      </div>

      {accountBalances.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {t("dashboard.accounts")}
            </h3>
            <Link
              to="/accounts?view=1"
              className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {accountGroups.map((g, i) => (
              <div key={g.owner.key}>
                {isShared && i > 0 && (
                  <div className="h-px bg-gray-100 dark:bg-white/10 my-4" />
                )}
                {isShared && (
                  <div className="flex items-center gap-2 mb-2 pt-2">
                    <UserBubble user={g.owner} size={20} />
                    <span className="text-[13px] font-semibold text-gray-500 truncate">
                      {g.owner.name}
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {g.items.map((a) => {
                    const isOwn = a.user_id === profile?.id;
                    const content = (
                      <>
                        <AccountMiniIcon account={a} size={14} />
                        <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                          {a.name}
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums shrink-0 ${a.balance < 0 ? "text-expense" : "text-gray-800"}`}
                        >
                          {formatCurrency(a.balance, currency)}
                        </span>
                      </>
                    );
                    if (isOwn) {
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => navigate(`/add?account=${a.id}`)}
                          className="w-full flex items-center gap-3 py-1.5 text-left cursor-pointer transition-colors"
                        >
                          {content}
                        </button>
                      );
                    }
                    return (
                      <div
                        key={a.id}
                        className="w-full flex items-center gap-3 py-1.5 text-left cursor-default"
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {donutData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {t("dashboard.expensesByCategory")}
          </h3>
          <ChartErrorBoundary
            fallback={
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                {t("dashboard.noChart")}
              </div>
            }
          >
            <Suspense fallback={<ChartSkeleton height="9rem" />}>
              <CategoryDonut
                data={donutData}
                currency={currency}
                showOwners={isShared}
              />
            </Suspense>
          </ChartErrorBoundary>
        </div>
      )}

      {monthlyData.some((m) => m.income > 0 || m.expense > 0) && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {t("dashboard.incomeVsExpense")}
          </h3>
          <ChartErrorBoundary
            fallback={
              <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                {t("dashboard.noChart")}
              </div>
            }
          >
            <Suspense fallback={<ChartSkeleton height="12rem" />}>
              <MonthlyBars data={monthlyData} currency={currency} />
            </Suspense>
          </ChartErrorBoundary>
          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-income" />
              <span className="text-xs text-gray-400">
                {t("dashboard.incomes")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-expense" />
              <span className="text-xs text-gray-400">
                {t("dashboard.expenses")}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("dashboard.recentTransactions")}
          </h3>
          <Link
            to="/transactions"
            className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline"
          >
            {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {periodTx.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
              <Sun className="w-6 h-6 text-accent/50" />
            </div>
            <p className="text-sm text-gray-400">
              {t("dashboard.noTransactions")}
            </p>
            <Link
              to="/add"
              className="text-xs text-accent font-semibold mt-2 inline-block hover:underline"
            >
              {t("dashboard.addFirst")}
            </Link>
          </div>
        ) : (
          <div className="space-y-0 bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 overflow-hidden">
            {periodTx.slice(0, 5).map((tx) => {
              const isOwn = spaces.some((s) => s.id === tx.space_id);
              const row = (
                <div
                  onClick={() => setDetailTx(tx)}
                  className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-white/10 last:border-b-0 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-w-0">
                    <TransactionRow
                      tx={tx}
                      currency={currency}
                      showAvatar
                      locale={locale}
                      accountsById={accountsById}
                      ownersById={ownersById}
                      currentUserId={profile?.id}
                    />
                  </div>
                </div>
              );
              return isOwn ? (
                <SwipeableRow
                  key={tx.id}
                  onEdit={() => {
                    navigate("/transactions", {
                      state: { editTxId: tx.id },
                    });
                  }}
                  onDelete={() => handleDeleteTx(tx.id)}
                >
                  {row}
                </SwipeableRow>
              ) : (
                <div key={tx.id}>{row}</div>
              );
            })}
          </div>
        )}
      </div>

      {showBalanceConfig && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowBalanceConfig(false)}
          />
          <div className="relative w-full lg:max-w-md max-h-[88dvh] flex flex-col rounded-t-3xl lg:rounded-3xl bg-white dark:bg-[#1A1D27] shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-white/10">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
                {t("dashboard.accountsInBalance")}
              </h2>
              <button
                onClick={() => setShowBalanceConfig(false)}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {prefsError && (
              <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-expense-light text-expense text-xs font-medium">
                No se pudo guardar la selección (revisa permisos de la tabla user_preferences).
              </div>
            )}
            <div className="overflow-y-auto p-3 space-y-0.5">
              {homeAccountBalances.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">
                  {t("accounts.empty")}
                </p>
              )}
              {homeAccountBalances.map((a) => {
                const checked = !excludedAccounts.has(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      const spaceKey = activeSpaceId ?? "";
                      const cur = new Set(exclusionsRef.current[spaceKey] ?? []);
                      if (checked) cur.add(a.id);
                      else cur.delete(a.id);
                      persistExclusions({
                        ...exclusionsRef.current,
                        [spaceKey]: [...cur],
                      });
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <AccountMiniIcon account={a} size={15} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                        {a.name}
                      </span>
                      <span className="block text-xs text-gray-400 truncate">
                        {formatCurrency(a.balance, currency)}
                      </span>
                    </span>
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                        checked
                          ? "bg-accent border-accent text-white"
                          : "border-gray-300 dark:border-white/20"
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-5 pt-3 pb-6 border-t border-gray-100 dark:border-white/10">
              <button
                onClick={() => setShowBalanceConfig(false)}
                className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold transition-opacity"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      <TransactionDetailModal
        tx={detailTx}
        currency={currency}
        onClose={() => setDetailTx(null)}
        onEdit={
          detailTx && spaces.some((s) => s.id === detailTx.space_id)
            ? () => {
                navigate("/transactions", {
                  state: { editTxId: detailTx.id },
                });
                setDetailTx(null);
              }
            : undefined
        }
        onDelete={
          detailTx && spaces.some((s) => s.id === detailTx.space_id)
            ? () => {
                handleDeleteTx(detailTx.id);
                setDetailTx(null);
              }
            : undefined
        }
      />
    </div>
  );
}

function SpaceSelector() {
  const { spaces, activeSpaceId, setActiveSpaceId } = useAppStore();
  if (spaces.length <= 1) return null;
  return (
    <select
      value={activeSpaceId ?? ""}
      onChange={(e) => setActiveSpaceId(e.target.value)}
      className="text-sm font-medium border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-600 focus:border-accent shadow-sm"
    >
      {spaces.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function AccountMiniIcon({
  account,
  size = 16,
}: {
  account: any;
  size?: number;
}) {
  if (!account) return null;
  const box = Math.round(size * 2.4);
  if (account.icon) {
    if (isImageIcon(account.icon)) {
      return (
        <span
          className="flex items-center justify-center shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-white/10"
          style={{ width: box, height: box }}
        >
          <img
            src={resolveIconSrc(account.icon)}
            alt=""
            className="w-full h-full object-cover"
          />
        </span>
      );
    }
    const Icon = getIcon(account.icon);
    return (
      <span
        className="flex items-center justify-center shrink-0 rounded-md"
        style={{
          width: box,
          height: box,
          backgroundColor: (account.color ?? DEFAULT_COLOR) + "20",
        }}
      >
        <Icon
          className="shrink-0"
          style={{
            width: size,
            height: size,
            color: account.color ?? DEFAULT_COLOR,
          }}
        />
      </span>
    );
  }
  const Icon =
    ACCOUNT_TYPE_ICONS[
      (account.type as import("@/types/database").AccountType) ?? "cash"
    ] ?? getIcon(null);
  return (
    <span
      className="flex items-center justify-center shrink-0 rounded-md"
      style={{
        width: box,
        height: box,
        backgroundColor: (account.color ?? DEFAULT_COLOR) + "20",
      }}
    >
      <Icon
        className="shrink-0"
        style={{
          width: size,
          height: size,
          color: account.color ?? DEFAULT_COLOR,
        }}
      />
    </span>
  );
}

function OtherUserBadge({
  owner,
  fallback,
}: {
  owner?: SpaceOwnerSummary;
  fallback: string;
}) {
  return (
    <span
      title={owner ? fallback + ": " + owner.name : fallback}
      className="shrink-0 inline-flex items-center gap-0.5 pl-1 pr-1 rounded-full text-[10px] font-semibold"
      style={{
        color: owner?.color ?? "#6B7280",
        backgroundColor: (owner?.color ?? "#6B7280") + "1A",
      }}
    >
      {owner?.avatar_url ? (
        <img
          src={owner.avatar_url}
          alt=""
          className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
        />
      ) : (
        <span
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
          style={{ backgroundColor: owner?.color ?? "#6B7280" }}
        >
          {owner?.name?.charAt(0).toUpperCase() ?? "?"}
        </span>
      )}
      {owner ? owner.name : fallback}
    </span>
  );
}

export function TransactionRow({
  tx,
  currency,
  showAvatar,
  locale = "en",
  accountsById,
  ownersById,
  currentUserId,
}: {
  tx: any;
  currency: string;
  showAvatar?: boolean;
  locale?: "es" | "en";
  accountsById?: Map<string, any>;
  ownersById?: Map<string, SpaceOwnerSummary>;
  currentUserId?: string;
}) {
  const { t } = useTranslation();
  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";
  const [viewer, setViewer] = useState<number | null>(null);
  const photos: string[] = Array.isArray(tx.photo_urls) ? tx.photo_urls : [];

  const fromAccount = tx.accounts ?? accountsById?.get(tx.account_id);
  const toAccount = tx.to_accounts ?? accountsById?.get(tx.to_account_id);
  const fromIsOtherUser =
    isTransfer &&
    !!fromAccount?.user_id &&
    fromAccount.user_id !== currentUserId;
  const toIsOtherUser =
    isTransfer &&
    !!toAccount?.user_id &&
    toAccount.user_id !== currentUserId;
  const toOwner =
    toIsOtherUser && toAccount?.user_id
      ? ownersById?.get(toAccount.user_id)
      : undefined;
  const fromOwner =
    fromIsOtherUser && fromAccount?.user_id
      ? ownersById?.get(fromAccount.user_id)
      : undefined;

  const title = isTransfer
    ? fromAccount?.name && toAccount?.name
      ? `${fromAccount.name} → ${toAccount.name}`
      : tx.description || t("add.transfer")
    : (tx.categories?.name ??
      tx.description ??
      (isIncome ? t("add.income") : t("add.expense")));

  return (
    <div className="flex items-center gap-3">
      {showAvatar && (
        tx.profiles?.avatar_url ? (
          <img
            src={tx.profiles.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm"
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: tx.profiles?.color ?? "#9CA3AF" }}
          >
            {tx.profiles?.name?.charAt(0).toUpperCase() ?? "—"}
          </div>
        )
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate flex items-center gap-1.5">
          {!isTransfer &&
            tx.categories?.name &&
            (() => {
              const catIcon = tx.categories?.icon;
              if (!catIcon || isImageIcon(catIcon)) {
                return catIcon ? (
                  <img
                    src={resolveIconSrc(catIcon)}
                    alt=""
                    className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                  />
                ) : null;
              }
              const Icon = getIcon(catIcon);
              return (
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: tx.categories?.color ?? DEFAULT_COLOR }}
                />
              );
            })()}
          {isTransfer && fromAccount && toAccount ? (
            <span className="flex items-center gap-1 min-w-0 truncate">
              <AccountMiniIcon account={fromAccount} size={11} />
              <span className="truncate">{fromAccount.name}</span>
              {fromIsOtherUser && (
                <OtherUserBadge
                  owner={fromOwner}
                  fallback={t("common.otherUser")}
                />
              )}
              <ArrowLeftRight className="w-3 h-3 text-gray-300 shrink-0" />
              <AccountMiniIcon account={toAccount} size={11} />
              <span className="truncate">{toAccount.name}</span>
              {toIsOtherUser && (
                <OtherUserBadge
                  owner={toOwner}
                  fallback={t("common.otherUser")}
                />
              )}
            </span>
          ) : (
            title
          )}
        </p>
        {tx.description && (
          <p className="text-xs text-gray-500 truncate">{tx.description}</p>
        )}
        <p className="text-xs text-gray-400 truncate">
          {format(new Date(tx.date), "dd MMM · h:mm a", {
            locale: locale === "es" ? esLocale : undefined,
          })}
          {!isTransfer && fromAccount?.name && ` · ${fromAccount.name}`}
        </p>
      </div>
      {photos.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setViewer(0);
          }}
          className="relative shrink-0 group"
        >
          <div className="flex">
            <img
              src={photos[0]}
              alt=""
              className="w-11 h-11 rounded-xl object-cover border border-gray-100 dark:border-white/10 shadow-sm group-active:opacity-80 transition"
            />
            {photos[1] && (
              <img
                src={photos[1]}
                alt=""
                className="w-11 h-11 rounded-xl object-cover border border-gray-100 dark:border-white/10 shadow-sm -ml-2 group-active:opacity-80 transition"
              />
            )}
          </div>
          {photos.length > 2 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-gray-50 dark:ring-[#12141A]">
              +{photos.length - 2}
            </span>
          )}
        </button>
      )}
      {isTransfer ? (
        <span className="text-sm font-semibold text-accent whitespace-nowrap tabular-nums shrink-0">
          → {formatCurrency(Number(tx.amount), currency)}
        </span>
      ) : (
        <span
          className={`text-sm font-bold whitespace-nowrap tabular-nums shrink-0 ${isIncome ? "text-income" : "text-expense"}`}
        >
          {isIncome ? "+" : "-"}
          {formatCurrency(Number(tx.amount), currency)}
        </span>
      )}
      <PhotoLightbox
        photos={photos}
        open={viewer !== null}
        initialIndex={viewer ?? 0}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}
