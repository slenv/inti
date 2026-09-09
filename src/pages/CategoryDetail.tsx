import EmptyState from "@/components/EmptyState";
import SwipeableRow from "@/components/SwipeableRow";
import UserBubble from "@/components/UserBubble";
import { IconTile } from "@/components/IconPicker";
import { useTranslation } from "@/lib/i18n";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
import {
  getShareScope,
  getUserOwners,
  getMyAccountIds,
  parseDayKey,
  spaceScopeFilter,
  type SpaceOwnerSummary,
} from "@/lib/shared";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { ArrowLeft, ChevronRight, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TransactionRow } from "./Dashboard";
import TransactionDetailModal from "./TransactionDetail";

interface CategoryDetailCache {
  category: any;
  transactions: any[];
  accounts: any[];
  owner: any;
  owners: Map<string, SpaceOwnerSummary>;
}

export default function CategoryDetail() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("categoryId") ?? "";
  const { activeSpaceId, spaces, profile } = useAppStore();
  const space = useAppStore((s) => s.getActiveSpace());
  const currency = space?.currency ?? "PEN";

  const cached = sessionData.get<CategoryDetailCache>(`category-detail:${categoryId}`);
  const [category, setCategory] = useState<any>(cached?.category ?? null);
  const [transactions, setTransactions] = useState<any[]>(cached?.transactions ?? []);
  const [accounts, setAccounts] = useState<any[]>(cached?.accounts ?? []);
  const [owner, setOwner] = useState<any>(cached?.owner ?? null);
  const [owners, setOwners] = useState<Map<string, SpaceOwnerSummary>>(cached?.owners ?? new Map());
  const [loading, setLoading] = useState(!cached && !!categoryId);
  const [detailTx, setDetailTx] = useState<any | null>(null);
  const isCategoryOwner = !!category?.user_id && category.user_id === profile?.id;

  useEffect(() => {
    if (!categoryId || !activeSpaceId) return;
    const spaceId = activeSpaceId;

    async function load() {
      const existing = sessionData.get<CategoryDetailCache>(`category-detail:${categoryId}`);
      if (existing) {
        setCategory(existing.category);
        setTransactions(existing.transactions);
        setAccounts(existing.accounts);
        setOwner(existing.owner);
        setOwners(existing.owners ?? new Map());
        setLoading(false);
      } else {
        setLoading(true);
      }
      const { scope: scopeIds } = await getShareScope(spaceId);
      const membersRes = await supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", spaceId);
      const hasOtherMembers = (membersRes.data ?? []).some(
        (m) => m.user_id !== profile?.id,
      );
      const mine = await getMyAccountIds(profile?.id);
      const scopeFilter = spaceScopeFilter({ scopeIds, myAccountIds: mine, hasOtherMembers });

      let query = supabase
        .from("transactions")
        .select(
          "*, profiles(name, color, avatar_url), categories(name, color, type, user_id), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
        )
        .eq("category_id", categoryId)
        .order("date", { ascending: false });
      if (scopeFilter) query = query.or(scopeFilter);
      else query = query.in("space_id", scopeIds);

      const [catRes, txRes, allAccounts, ownersMap] = await Promise.all([
        supabase.from("categories").select("*").eq("id", categoryId).single(),
        query,
        supabase
          .from("accounts")
          .select("id, user_id, name, icon, color, type"),
        getUserOwners(),
      ]);

      const cat = catRes.data ?? null;
      const txData = txRes.data ?? [];
      const ownerData = cat ? ownersMap.get(cat.user_id) : undefined;
      setCategory(cat);
      setTransactions(txData);
      setAccounts(allAccounts.data ?? []);
      setOwner(ownerData);
      setOwners(ownersMap);
      sessionData.set(`category-detail:${categoryId}`, {
        category: cat,
        transactions: txData,
        accounts: allAccounts.data ?? [],
        owner: ownerData,
        owners: ownersMap,
      });
      setLoading(false);
    }
    load();
  }, [categoryId, activeSpaceId]);

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
    () => new Map(accounts.map((a: any) => [a.id, a])),
    [accounts],
  );

  useLockBodyScroll(!!detailTx, () => setDetailTx(null));

  async function handleDeleteTx(id: string) {
    if (!confirm(t("transactions.deleteConfirm"))) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      console.error("[category-detail] delete", error);
      alert(t("transactions.deleteError"));
      return;
    }
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    setDetailTx(null);
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!category)
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <EmptyState
          icon={Tag}
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
          <IconTile icon={category.icon} color={category.color} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-800 truncate">
              {category.name}
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

      <div
        className="rounded-2xl p-5 text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${category.color ?? "#8B72D4"} 0%, ${category.color ?? "#8B72D4"}99 100%)`,
        }}
      >
        <p className="text-sm opacity-80 mb-1">{t("dashboard.expensesByCategory")}</p>
        <p className="text-2xl font-bold">
          {formatCurrency(total, currency)}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Tag}
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
                {txs.map((tx) => {
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
                          ownersById={owners}
                          currentUserId={profile?.id}
                        />
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                    </div>
                  );
                  return isCategoryOwner ? (
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
        </div>
      )}

      <TransactionDetailModal
        tx={detailTx}
        currency={currency}
        onClose={() => setDetailTx(null)}
        ownersById={owners}
        currentUserId={profile?.id}
        currentProfile={profile}
        onEdit={
          isCategoryOwner && detailTx
            ? () => {
                navigate(`/add?edit=${detailTx.id}`);
                setDetailTx(null);
              }
            : undefined
        }
        onDelete={
          isCategoryOwner && detailTx
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