import EmptyState from "@/components/EmptyState";
import PeriodSelector from "@/components/PeriodSelector";
import SwipeableRow from "@/components/SwipeableRow";
import { finishProgress, startProgress } from "@/components/TopProgress";
import { downloadCsv, exportPdf, toCsv } from "@/lib/export";
import { computeFlowTotals } from "@/lib/flow";
import { useTranslation } from "@/lib/i18n";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { fromRange, periodRange, type Period } from "@/lib/period";
import { getMyAccountIds, getShareScope, getUserOwners, parseDayKey, spaceScopeFilter, type SpaceOwnerSummary } from "@/lib/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TransactionRow } from "./Dashboard";
import TransactionDetailModal from "./TransactionDetail";

type EditType = "expense" | "income" | "transfer";

interface Filters {
  search: string;
  type: "" | EditType;
  categoryId: string;
  accountId: string;
  from: string;
  to: string;
}

const PAGE_SIZE = 30;

interface TransactionsCache {
  transactions: any[];
  allowedAccounts: Set<string>;
  hasOtherMembers: boolean;
}

const txDataKey = (spaceId: string | null, from: string, to: string) =>
  `transactions:${spaceId ?? "none"}:${from}:${to}`;

interface TotalsSummary {
  income: number;
  expense: number;
  balance: number;
  rows: any[];
}

const txSummaryKey = (spaceId: string | null, from: string, to: string) =>
  `transactions-summary:${spaceId ?? "none"}:${from}:${to}`;

function loadSummaryFromStorage(key: string): Omit<TotalsSummary, "rows"> | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed &&
      typeof parsed.income === "number" &&
      typeof parsed.expense === "number" &&
      typeof parsed.balance === "number"
    ) {
      return parsed;
    }
  } catch {
    // ignorar
  }
  return undefined;
}

function saveSummaryToStorage(key: string, summary: Omit<TotalsSummary, "rows">) {
  try {
    localStorage.setItem(key, JSON.stringify(summary));
  } catch {
    // ignorar (cuota llena, modo privado, etc.)
  }
}

const txMetaKey = (spaceId: string | null) =>
  `transactions-meta:${spaceId ?? "none"}`;

interface TransactionsMetaCache {
  accounts: any[];
  allAccounts: any[];
  owners: Map<string, SpaceOwnerSummary>;
  categories: any[];
}

export default function Transactions() {
  const { t, locale } = useTranslation();
  const { activeSpaceId, spaces, period, setPeriod, profile } = useAppStore();
  const space = useAppStore((s) => s.getActiveSpace());
  const navigate = useNavigate();
  const location = useLocation();

  const metaCached = sessionData.get<TransactionsMetaCache>(txMetaKey(activeSpaceId));
  const [accounts, setAccounts] = useState<any[]>(metaCached?.accounts ?? []);
  const [allAccounts, setAllAccounts] = useState<any[]>(metaCached?.allAccounts ?? []);
  const [owners, setOwners] = useState<Map<string, SpaceOwnerSummary>>(
    metaCached?.owners ?? new Map(),
  );
  const [categories, setCategories] = useState<any[]>(metaCached?.categories ?? []);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [allowedAccounts, setAllowedAccounts] = useState<Set<string>>(new Set());
  const [hasOtherMembers, setHasOtherMembers] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => {
    // Sincroniza con el período elegido en el Home: mismo rango de fechas.
    const range = periodRange(period, { weekStartsOn: locale === "es" ? 1 : 0 });
    return {
      search: "",
      type: "",
      categoryId: "",
      accountId: "",
      ...fromRange(range),
    };
  });

  // Caché de sesión: al volver a esta ventana sin recargar, no mostrar skeleton.
  const cached = sessionData.get<TransactionsCache>(txDataKey(activeSpaceId, filters.from, filters.to));
  const [transactions, setTransactions] = useState<any[]>(cached?.transactions ?? []);
  const [loading, setLoading] = useState(!cached);

  // Detalle y paginación.
  const [detailTx, setDetailTx] = useState<any | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<() => void>(() => {});
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [absTotals, setAbsTotals] = useState<TotalsSummary | null>(null);

  const txCacheKey = () => `transactions:${activeSpaceId ?? "none"}:${filters.from}:${filters.to}`;

  // Cuentas / categorías / métodos de pago: se cargan una sola vez por espacio,
  // no dependen del rango de fechas ni de los demás filtros.
  useEffect(() => {
    if (!activeSpaceId) return;
    const spaceId = activeSpaceId;

    async function loadMeta() {
      const [accRes, catRes, allAccRes, ownersMap] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", profile?.id),
        supabase.from("categories").select("*").eq("user_id", profile?.id),
        supabase.from("accounts").select("*"),
        getUserOwners(),
      ]);
      const accountsData = accRes.data ?? [];
      const categoriesData = catRes.data ?? [];
      const allAccountsData = allAccRes.data ?? [];
      setAccounts(accountsData);
      setCategories(categoriesData);
      setAllAccounts(allAccountsData);
      setOwners(ownersMap);
      sessionData.set(txMetaKey(spaceId), {
        accounts: accountsData,
        allAccounts: allAccountsData,
        owners: ownersMap,
        categories: categoriesData,
      });
    }
    loadMeta();
  }, [activeSpaceId, profile?.id]);

  // Transacciones: acotadas al rango de fecha, con paginado real en el servidor.
  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;
    setHasMore(true);
    setLoadingMore(false);

    async function loadTransactions() {
      const existing = sessionData.get<TransactionsCache>(txDataKey(spaceId, filters.from, filters.to));
      if (existing) {
        setTransactions(existing.transactions);
        setAllowedAccounts(existing.allowedAccounts);
        setHasOtherMembers(existing.hasOtherMembers);
        setHasMore(existing.transactions.length >= PAGE_SIZE);
        setLoading(false);
      } else {
        setLoading(true);
      }
      // Restaura los totales de inmediato (sesión o localStorage) para no mostrar 0.
      const summary =
        sessionData.get<Omit<TotalsSummary, "rows">>(txSummaryKey(spaceId, filters.from, filters.to)) ??
        loadSummaryFromStorage(txSummaryKey(spaceId, filters.from, filters.to));
      if (summary) setAbsTotals({ rows: [], ...summary });
      const isInitial = transactions.length === 0;
      if (isInitial) startProgress();

      try {
        const scope = await buildScope(spaceId);
        setAllowedAccounts(scope.allowedSet);
        setHasOtherMembers(scope.hasOtherMembers);
        const page = await fetchPage(0, PAGE_SIZE - 1, spaceId, scope);
        setTransactions(page.items);
        setHasMore(page.items.length >= PAGE_SIZE);
        sessionData.set(txDataKey(spaceId, filters.from, filters.to), {
          transactions: page.items,
          allowedAccounts: scope.allowedSet,
          hasOtherMembers: scope.hasOtherMembers,
        });
        refreshTotals(scope);
      } catch {
        setFetchError(t("transactions.loadError"));
      } finally {
        setLoading(false);
        if (isInitial) finishProgress();
      }
    }
    loadTransactions();
  }, [activeSpaceId, filters.from, filters.to]);

  async function buildScope(spaceId: string) {
    const [shareScope, membersRes] = await Promise.all([
      getShareScope(spaceId),
      supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", spaceId),
    ]);
    const { scope: scopeIds, allowedAccounts: allowedIds } = shareScope;
    const allowedSet = new Set(allowedIds);
    const hasOtherMembers = (membersRes.data ?? []).some(
      (m) => m.user_id !== profile?.id,
    );
    const myAccountIds = await getMyAccountIds(profile?.id);
    const scopeFilter = spaceScopeFilter({ scopeIds, myAccountIds, hasOtherMembers });
    return { scopeIds, allowedSet, hasOtherMembers, scopeFilter };
  }

  type Scope = Awaited<ReturnType<typeof buildScope>>;

  async function fetchPage(
    start: number,
    end: number,
    spaceId: string,
    scope: Scope,
  ) {
    let query = supabase
      .from("transactions")
      .select(
        "*, profiles(name, color, avatar_url), categories(name, color, type), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
      )
      .order("date", { ascending: false })
      .range(start, end);
    if (scope.scopeFilter) query = query.or(scope.scopeFilter);
    else query = query.in("space_id", scope.scopeIds);
    if (filters.from) query = query.gte("date", filters.from);
    if (filters.to) query = query.lte("date", filters.to);

    const { data, error } = await query;
    if (error) setFetchError(t("transactions.loadError"));
    else setFetchError(null);
    const rowData = data ?? [];
    const items =
      scope.hasOtherMembers && scope.allowedSet.size
        ? rowData.filter(
            (tx) =>
              scope.allowedSet.has(tx.account_id) ||
              (tx.to_account_id && scope.allowedSet.has(tx.to_account_id)),
          )
        : rowData;
    return { items };
  }

  async function refreshTotals(scope?: Scope) {
    try {
      let built = scope;
      if (!built && activeSpaceId) built = await buildScope(activeSpaceId);
      if (!built) return;
      let query = supabase
        .from("transactions")
        .select("account_id, to_account_id, amount, type");
      if (built.scopeFilter) query = query.or(built.scopeFilter);
      else query = query.in("space_id", built.scopeIds);
      if (filters.from) query = query.gte("date", filters.from);
      if (filters.to) query = query.lte("date", filters.to);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
      if (filters.accountId)
        query = query.or(
          `account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`,
        );
      const { data, error } = await query;
      if (error) throw error;
      const allowed = built.allowedSet;
      const rows = data ?? [];
      const filteredRows =
        built.hasOtherMembers && allowed.size
          ? rows.filter(
              (tx) =>
                allowed.has(tx.account_id) ||
                (tx.to_account_id && allowed.has(tx.to_account_id)),
            )
          : rows;
      const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
      const { income, expense } = computeFlowTotals(filteredRows, {
        currentUserId: profile?.id,
        isShared: built.hasOtherMembers,
        allowedAccounts: allowed,
        getAccount: (id) => accountsById.get(id),
      });
      const map: Record<string, number> = {};
      filteredRows.forEach((tx) => {
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
      const visibleAccounts = allAccounts.filter((a) =>
        built.hasOtherMembers ? allowed.has(a.id) : a.user_id === profile?.id,
      );
      const balance = visibleAccounts.reduce((s, a) => s + (map[a.id] ?? 0), 0);
      const summary: TotalsSummary = {
        income,
        expense,
        balance,
        rows: filteredRows,
      };
      setAbsTotals(summary);
      if (activeSpaceId) {
        const { rows: _rows, ...persist } = summary;
        const key = txSummaryKey(activeSpaceId, filters.from, filters.to);
        sessionData.set(key, persist);
        saveSummaryToStorage(key, persist);
      }
    } catch {
      // silencioso: los totales se mantienen con lo visto antes
    }
  }

  loadMoreRef.current = async () => {
    if (loadingMore || !hasMore || !activeSpaceId) return;
    setLoadingMore(true);
    try {
      const spaceId = activeSpaceId;
      const scope = await buildScope(spaceId);
      const start = transactions.length;
      const { items } = await fetchPage(start, start + PAGE_SIZE - 1, spaceId, scope);
      if (items.length === 0) {
        setHasMore(false);
        return;
      }
      setTransactions((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...items.filter((t) => !seen.has(t.id))];
      });
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      // silencioso
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { rootMargin: "600px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  });

  // Recalcula balance/totales cuando cambian los filtros que no son de fecha.
  useEffect(() => {
    if (!activeSpaceId) return;
    refreshTotals();
  }, [filters.type, filters.categoryId, filters.accountId, filters.from, filters.to, activeSpaceId, allAccounts]);

  // Al llegar desde el Home con "expenseDetail" (gastos por categoría).
  useEffect(() => {
    const state = location.state as { expenseDetail?: boolean; categoryId?: string } | null;
    if (state?.expenseDetail) {
      setFilters((f) => ({
        ...f,
        search: "",
        type: "expense",
        categoryId: state.categoryId ?? "",
        accountId: "",
      }));
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const filtered = transactions.filter((tx) => {
    if (filters.type && tx.type !== filters.type) return false;
    if (filters.categoryId && tx.category_id !== filters.categoryId) return false;
    if (filters.accountId && tx.account_id !== filters.accountId && tx.to_account_id !== filters.accountId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const desc = (tx.description ?? "").toLowerCase();
      const catName = (tx.categories?.name ?? "").toLowerCase();
      const accName = (tx.accounts?.name ?? "").toLowerCase();
      const toName = (tx.to_accounts?.name ?? "").toLowerCase();
      if (!desc.includes(q) && !catName.includes(q) && !accName.includes(q) && !toName.includes(q)) return false;
    }
    return true;
  });

  const isSharedSpace = hasOtherMembers;
  const accountsById = new Map(allAccounts.map((a) => [a.id, a]));
  const totalIncome = absTotals?.income ?? 0;
  const totalExpense = absTotals?.expense ?? 0;

  // Balance total: usa TODOS los movimientos del rango (no solo la página visible).
  const balanceTotal = absTotals?.balance ?? 0;
  const currency = space?.currency ?? "PEN";
  const hasActiveFilters =
    filters.type || filters.categoryId || filters.accountId;

  function onPeriodChange(next: Period) {
    setPeriod(next);
    setFilters((f) => ({
      ...f,
      ...fromRange(periodRange(next, { weekStartsOn: locale === "es" ? 1 : 0 })),
    }));
  }

  async function handleDeleteTx(id: string) {
    if (!confirm(t("transactions.deleteConfirm"))) return;
    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);
    if (deleteError) {
      console.error("[transactions] delete", deleteError);
      alert(t("transactions.deleteError"));
      return;
    }
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    refreshTotals().catch(() => {});
  }

  function exportRows() {
    return filtered.map((tx) => [
      format(new Date(tx.date), "dd MMM yyyy", { locale: locale === "es" ? esLocale : undefined }),
      tx.description ?? "",
      tx.type === "transfer"
        ? t("export.typeTransfer")
        : (tx.categories?.name ?? ""),
      tx.type === "transfer"
        ? `${tx.accounts?.name ?? ""} → ${tx.to_accounts?.name ?? ""}`
        : (tx.accounts?.name ?? ""),
      tx.type === "expense"
        ? t("export.typeExpense")
        : tx.type === "transfer"
          ? t("export.typeTransfer")
          : t("export.typeIncome"),
      String(tx.amount),
    ]);
  }

  function exportHead() {
    return [
      t("export.date"),
      t("export.description"),
      t("export.category"),
      t("export.account"),
      t("export.type"),
      t("export.amount"),
    ];
  }

  async function handleExportCsv() {
    try {
      const csv = toCsv(exportRows(), exportHead());
      await downloadCsv(
        csv,
        `inti-${(space?.name ?? "space").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      alert(t("transactions.exportError"));
    }
  }

  async function handleExportPdf() {
    try {
      await exportPdf({
        rows: exportRows(),
        head: exportHead(),
        title: `${t("transactions.title")} · ${space?.name ?? ""}`,
        filename: `inti-${(space?.name ?? "space").replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch {
      alert(t("transactions.exportError"));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-28 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />
        <div className="h-11 rounded-xl bg-gray-100 dark:bg-white/10 animate-pulse" />
        <div className="h-14 rounded-xl bg-gray-100 dark:bg-white/10 animate-pulse" />
        <div className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 divide-y divide-gray-50 dark:divide-white/10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />
                <div className="h-2.5 w-1/3 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />
              </div>
              <div className="h-3 w-14 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-gray-500">{fetchError}</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-primary w-auto px-6"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {t("transactions.title")}
        </h1>
        <button
          onClick={() => navigate("/add")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold shadow-md shadow-accent/25 active:scale-[0.97] transition-transform"
        >
          <Plus className="w-4 h-4" /> {t("transactions.addNew")}
        </button>
      </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t("common.search")}
                value={filters.search}
                onChange={(e) =>
                  setFilters({ ...filters, search: e.target.value })
                }
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:border-accent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2.5 rounded-xl border text-sm transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-accent/10 border-accent text-accent"
                  : "bg-white border-gray-200 text-gray-400"
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCsv}
              title={t("export.csv")}
              className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-400 hover:text-accent hover:border-accent transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportPdf}
              title={t("export.pdf")}
              className="p-2.5 rounded-xl border border-gray-200 bg-white text-gray-400 hover:text-accent hover:border-accent transition-colors"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>

          {showFilters && (
            <div className="bg-white dark:bg-night-card rounded-2xl shadow-sm p-4 space-y-3 border border-gray-50 dark:border-white/10">
              <div className="flex gap-2">
                <select
                  value={filters.type}
                  onChange={(e) =>
                    setFilters({ ...filters, type: e.target.value as any })
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 dark:bg-night-input"
                >
                  <option value="">{t("common.all")}</option>
                  <option value="income">{t("transactions.incomes")}</option>
                  <option value="expense">{t("transactions.expenses")}</option>
                  <option value="transfer">{t("add.transfer")}</option>
                </select>
                <select
                  value={filters.categoryId}
                  onChange={(e) =>
                    setFilters({ ...filters, categoryId: e.target.value })
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 dark:bg-night-input"
                >
                  <option value="">{t("transactions.allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <select
                  value={filters.accountId}
                  onChange={(e) =>
                    setFilters({ ...filters, accountId: e.target.value })
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 dark:bg-night-input"
                >
                  <option value="">{t("transactions.allAccounts")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 dark:bg-night-input"
                />
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 dark:bg-night-input"
                />
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() =>
                    setFilters({
                      search: "",
                      type: "",
                      categoryId: "",
                      accountId: "",
                      from: "",
                      to: "",
                    })
                  }
                  className="flex items-center gap-1 text-xs text-accent font-medium hover:underline"
                >
                  <X className="w-3 h-3" /> {t("transactions.clearFilters")}
                </button>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {t("dashboard.balance")}
                </p>
                <p
                  className={`text-2xl font-bold mt-1 ${!absTotals ? "text-gray-400 animate-pulse" : balanceTotal >= 0 ? "text-income" : "text-expense"}`}
                >
                  {absTotals
                    ? formatCurrency(balanceTotal, currency)
                    : "—"}
                </p>
              </div>
            </div>
            <PeriodSelector value={period} onChange={onPeriodChange} />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate("/type-detail?type=income")}
                className="rounded-xl bg-income-light/70 dark:bg-income/15 p-3 text-left cursor-pointer active:scale-[0.98] transition-transform"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-income uppercase tracking-wide">
                  <ArrowDownLeft className="w-3.5 h-3.5" />{" "}
                  {t("transactions.incomes")}
                </p>
                <p className="text-sm font-bold text-income mt-1">
                  {absTotals ? formatCurrency(totalIncome, currency) : "—"}
                </p>
              </button>
              <button
                onClick={() => navigate("/type-detail?type=expense")}
                className="rounded-xl bg-expense-light/70 dark:bg-expense/15 p-3 text-left cursor-pointer active:scale-[0.98] transition-transform"
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-expense uppercase tracking-wide">
                  <ArrowUpRight className="w-3.5 h-3.5" />{" "}
                  {t("transactions.expenses")}
                </p>
                <p className="text-sm font-bold text-expense mt-1">
                  {absTotals ? formatCurrency(totalExpense, currency) : "—"}
                </p>
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={t("transactions.noResults")}
              description={t("transactions.noResultsDesc")}
            />
          ) : (
            (() => {
              const groups = new Map<string, any[]>();
              filtered.forEach((tx) => {
                const key = format(new Date(tx.date), "yyyy-MM-dd");
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(tx);
              });
              return (
                <div className="space-y-4">
                  {[...groups.entries()].map(([day, txs]) => (
                    <div key={day}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                        {format(parseDayKey(day), "EEEE d MMM", {
                          locale: locale === "es" ? esLocale : undefined,
                        })}
                      </p>
                      <div className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 overflow-hidden">
                        {txs.map((tx) => {
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
                                  accountsById={new Map(allAccounts.map((a) => [a.id, a]))}
                                  ownersById={owners}
                                  currentUserId={profile?.id}
                                />
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            </div>
                          );
                          return isOwn ? (
<SwipeableRow
                                  key={tx.id}
                                  onEdit={() => navigate(`/add?edit=${tx.id}`)}
                                  onDelete={() => handleDeleteTx(tx.id)}
                                >
                              {row}
                            </SwipeableRow>
                          ) : (
                            <div key={tx.id}>{row}</div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {loadingMore ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                      <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : hasMore ? (
                    <div ref={sentinelRef} className="h-2" />
                  ) : null}
                </div>
              );
            })()
          )}

      <TransactionDetailModal
        tx={detailTx}
        currency={currency}
        onClose={() => setDetailTx(null)}
        ownersById={owners}
        currentUserId={profile?.id}
        currentProfile={profile}
        onEdit={
          detailTx && spaces.some((s) => s.id === detailTx.space_id)
            ? () => {
                navigate(`/add?edit=${detailTx.id}`);
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