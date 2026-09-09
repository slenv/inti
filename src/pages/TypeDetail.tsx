import EmptyState from "@/components/EmptyState";
import PeriodSelector from "@/components/PeriodSelector";
import { useTranslation } from "@/lib/i18n";
import { classifyFlow } from "@/lib/flow";
import { fromRange, periodRange, type Period } from "@/lib/period";
import { getShareScope, getUserOwners, getMyAccountIds, parseDayKey, spaceScopeFilter, type SpaceOwnerSummary } from "@/lib/shared";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TransactionRow } from "./Dashboard";

interface TypeDetailCache {
  transactions: any[];
  accounts: any[];
  allowedAccounts: Set<string>;
  owners: Map<string, SpaceOwnerSummary>;
}

export default function TypeDetail() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") === "income" ? "income" : "expense";
  const { activeSpaceId, spaces, period, setPeriod, profile } = useAppStore();
  const space = useAppStore((s) => s.getActiveSpace());
  const currency = space?.currency ?? "PEN";

  const cached = sessionData.get<TypeDetailCache>(`type-detail:${type}:${activeSpaceId ?? "none"}:${period}`);
  const [transactions, setTransactions] = useState<any[]>(cached?.transactions ?? []);
  const [accounts, setAccounts] = useState<any[]>(cached?.accounts ?? []);
  const [loading, setLoading] = useState(!cached);
  const [allowedAccounts, setAllowedAccounts] = useState<Set<string>>(cached?.allowedAccounts ?? new Set());
  const [owners, setOwners] = useState<Map<string, SpaceOwnerSummary>>(cached?.owners ?? new Map());

  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;

    async function load() {
      const existing = sessionData.get<TypeDetailCache>(`type-detail:${type}:${spaceId}:${period}`);
      if (existing) {
        setTransactions(existing.transactions);
        setAccounts(existing.accounts);
        setAllowedAccounts(existing.allowedAccounts);
        setOwners(existing.owners ?? new Map());
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const [shareScope, membersRes] = await Promise.all([
          getShareScope(spaceId),
          supabase
            .from("space_members")
            .select("user_id")
            .eq("space_id", spaceId),
        ]);
        const { scope: scopeIds, allowedAccounts: allowedIds } = shareScope;
        const allowedSet = new Set(allowedIds);
        setAllowedAccounts(allowedSet);
        const hasOtherMembers = (membersRes.data ?? []).some(
          (m) => m.user_id !== profile?.id,
        );

        const range = periodRange(period, { weekStartsOn: locale === "es" ? 1 : 0 });
        const { from, to } = fromRange(range);

        const myAccountIds = await getMyAccountIds(profile?.id);
        const scopeFilter = spaceScopeFilter({ scopeIds, myAccountIds, hasOtherMembers });

        let query = supabase
          .from("transactions")
          .select(
            "*, profiles(name, color, avatar_url), categories(name, color, type, user_id), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
          )
          .in("type", ["income", "expense", "transfer"])
          .order("date", { ascending: false });
        if (scopeFilter) query = query.or(scopeFilter);
        else query = query.in("space_id", scopeIds);
        if (from) query = query.gte("date", from);
        if (to) query = query.lte("date", to);

        const [txRes, accRes, ownersMap] = await Promise.all([
          query,
          supabase
            .from("accounts")
            .select("id, user_id, name, icon, color, type"),
          getUserOwners(),
        ]);
        const accData = accRes.data ?? [];
        const accById = new Map(accData.map((a) => [a.id, a]));
        const rowData = (txRes.data ?? []).filter((tx) => {
          const { isIncome, isExpense } = classifyFlow(tx, {
            currentUserId: profile?.id,
            isShared: hasOtherMembers,
            allowedAccounts: allowedSet,
            getAccount: (id) => accById.get(id),
          });
          return type === "income" ? isIncome : isExpense;
        });
        const filteredData = hasOtherMembers && allowedSet.size
          ? rowData.filter(
              (tx) =>
                allowedSet.has(tx.account_id) ||
                (tx.to_account_id && allowedSet.has(tx.to_account_id)),
            )
          : rowData;
        sessionData.set(`type-detail:${type}:${spaceId}:${period}`, {
          transactions: filteredData,
          accounts: accData,
          allowedAccounts: allowedSet,
          owners: ownersMap,
        });
        setTransactions(filteredData);
        setAccounts(accData);
        setOwners(ownersMap);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeSpaceId, period, locale]);

  const total = useMemo(
    () => transactions.reduce((s, tx) => s + Number(tx.amount), 0),
    [transactions],
  );

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    transactions.forEach((tx) => {
      const key = format(new Date(tx.date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    });
    return [...map.entries()];
  }, [transactions]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  function onPeriodChange(next: Period) {
    setPeriod(next);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const isIncome = type === "income";
  const TitleIcon = isIncome ? TrendingUp : TrendingDown;
  const colorClass = isIncome ? "text-income" : "text-expense";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${isIncome ? "bg-income-light" : "bg-expense-light"}`}
          >
            <TitleIcon className={`w-5 h-5 ${colorClass}`} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              {isIncome ? t("transactions.incomes") : t("transactions.expenses")}
            </h1>
            <p className="text-xs text-gray-400">{t("accountDetail.balance")}</p>
          </div>
        </div>
      </div>

      <div
        className={`bg-gradient-to-br rounded-2xl p-5 text-white shadow-lg ${isIncome ? "from-income to-income/80" : "from-expense to-expense/80"}`}
      >
        <p className="text-sm opacity-80 mb-1">
          {isIncome ? (
            <span className="flex items-center gap-1">
              <ArrowDownLeft className="w-4 h-4" /> {t("transactions.incomes")}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4" /> {t("transactions.expenses")}
            </span>
          )}
        </p>
        <p className="text-2xl font-bold">
          {formatCurrency(total, currency)}
        </p>
      </div>

      <PeriodSelector value={period} onChange={onPeriodChange} />

      {groups.length === 0 ? (
        <EmptyState
          icon={isIncome ? TrendingUp : TrendingDown}
          title={t("accountDetail.noTransactions")}
          description={t("accountDetail.noTransactionsDesc")}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([day, txs]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {format(parseDayKey(day), "EEEE d MMM", {
                  locale: locale === "es" ? esLocale : undefined,
                })}
              </p>
              <div className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 overflow-hidden">
                {txs.map((tx, i) => (
                  <div
                    key={tx.id}
                    className={`px-4 py-3 ${i > 0 ? "border-t border-gray-50 dark:border-white/10" : ""}`}
                  >
                    <TransactionRow
                      tx={tx}
                      currency={currency}
                      showAvatar
                      locale={locale}
                      accountsById={accountsById}
                      ownersById={owners}
                      currentUserId={profile?.id}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}