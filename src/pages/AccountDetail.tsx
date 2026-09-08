import EmptyState from "@/components/EmptyState";
import UserBubble from "@/components/UserBubble";
import { useTranslation } from "@/lib/i18n";
import { getShareScope, getUserOwners, type SpaceOwnerSummary } from "@/lib/shared";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { ArrowLeft, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AccountMiniIcon, TransactionRow } from "./Dashboard";

interface AccountDetailCache {
  account: any;
  transactions: any[];
  accounts: any[];
  owner: any;
  owners: Map<string, SpaceOwnerSummary>;
}

export default function AccountDetail() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("id") ?? "";
  const { activeSpaceId, spaces, profile } = useAppStore();
  const space = useAppStore((s) => s.getActiveSpace());
  const currency = space?.currency ?? "PEN";

  const cached = sessionData.get<AccountDetailCache>(`account-detail:${accountId}`);
  const [account, setAccount] = useState<any>(cached?.account ?? null);
  const [transactions, setTransactions] = useState<any[]>(cached?.transactions ?? []);
  const [accounts, setAccounts] = useState<any[]>(cached?.accounts ?? []);
  const [owner, setOwner] = useState<any>(cached?.owner ?? null);
  const [owners, setOwners] = useState<Map<string, SpaceOwnerSummary>>(cached?.owners ?? new Map());
  const [loading, setLoading] = useState(!cached && !!accountId);

  useEffect(() => {
    if (!accountId || !activeSpaceId) return;
    const spaceId = activeSpaceId;

    async function load() {
      const existing = sessionData.get<AccountDetailCache>(`account-detail:${accountId}`);
      if (existing) {
        setAccount(existing.account);
        setTransactions(existing.transactions);
        setAccounts(existing.accounts);
        setOwner(existing.owner);
        setOwners(existing.owners ?? new Map());
        setLoading(false);
      } else {
        setLoading(true);
      }
      const { scope: spaceScope } = await getShareScope(spaceId);
      const [accRes, txRes, ownersMap] = await Promise.all([
        supabase
          .from("accounts")
          .select("id, user_id, name, icon, color, type"),
        supabase
          .from("transactions")
          .select(
            "*, profiles(name, color, avatar_url), categories(name, color, type, user_id), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
          )
          .in("space_id", spaceScope)
          .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
          .order("date", { ascending: false }),
        getUserOwners(),
      ]);

      const allAccounts = accRes.data ?? [];
      const acc = allAccounts.find((a: any) => a.id === accountId);
      const txData = txRes.data ?? [];
      const ownerData = acc ? ownersMap.get(acc.user_id) : undefined;
      setAccount(acc ?? null);
      setAccounts(allAccounts);
      setOwner(ownerData);
      setOwners(ownersMap);
      setTransactions(txData);
      sessionData.set(`account-detail:${accountId}`, {
        account: acc ?? null,
        transactions: txData,
        accounts: allAccounts,
        owner: ownerData,
        owners: ownersMap,
      });
      setLoading(false);
    }
    load();
  }, [accountId, activeSpaceId]);

  const balance = useMemo(() => {
    let sum = 0;
    transactions.forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "transfer") {
        if (tx.account_id === accountId) sum -= amt;
        if (tx.to_account_id === accountId) sum += amt;
      } else if (tx.type === "income") {
        if (tx.account_id === accountId) sum += amt;
      } else if (tx.account_id === accountId) {
        sum -= amt;
      }
    });
    return sum;
  }, [transactions, accountId]);

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
    () => new Map(accounts.map((a: any) => [a.id, a])),
    [accounts],
  );

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!account)
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <EmptyState
          icon={Wallet}
          title={t("accountDetail.notFound")}
          description={t("accountDetail.notFoundDesc")}
          action={
            <button
              onClick={() => navigate(-1)}
              className="btn-primary w-auto px-6"
            >
              {t("common.back")}
            </button>
          }
        />
      </div>
    );

  const ownerLabel = owner?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <AccountMiniIcon account={account} size={18} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-800 truncate">
              {account.name}
            </h1>
            {owner && (
              <div className="flex items-center gap-1">
                <UserBubble user={owner} size={14} />
                <span className="text-[11px] text-gray-400 truncate">
                  {ownerLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-accent to-accent-hover rounded-2xl p-5 text-white shadow-lg shadow-accent/30">
        <p className="text-sm opacity-80 mb-1">{t("accountDetail.balance")}</p>
        <p className="text-2xl font-bold">
          {formatCurrency(balance, currency)}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t("accountDetail.noTransactions")}
          description={t("accountDetail.noTransactionsDesc")}
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([day, txs]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {format(new Date(day), "EEEE d MMM", {
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
