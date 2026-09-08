import EmptyState from "@/components/EmptyState";
import ColorPicker from "@/components/ColorPicker";
import IconPicker, { IconTile } from "@/components/IconPicker";
import { useTranslation } from "@/lib/i18n";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type { Account, AccountType } from "@/types/database";
import { COLORS, formatCurrency } from "@/types/database";
import { ACCOUNT_TYPE_ICONS } from "@/lib/icons";
import { getShareScope, getUserOwners, getMyAccountIds, spaceScopeFilter, groupByUser, type SpaceOwnerSummary } from "@/lib/shared";
import UserBubble from "@/components/UserBubble";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Wallet,
  PencilLine,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const TYPE_KEYS: Record<AccountType, string> = {
  cash: "accounts.type.cash",
  bank: "accounts.type.bank",
  digital_wallet: "accounts.type.digital",
  savings: "accounts.type.savings",
  other: "accounts.type.other",
};

interface AccountsCache {
  accounts: Account[];
  balances: Record<string, number>;
  ownersById: Map<string, SpaceOwnerSummary>;
  scope: string[];
  allowedAccounts: Set<string>;
  isShared: boolean;
}

export default function Accounts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get("view") === "1";
  const { activeSpaceId, spaces, profile } = useAppStore();
  const cached = sessionData.get<AccountsCache>(`accounts:${activeSpaceId ?? "none"}`);
  const [accounts, setAccounts] = useState<Account[]>(cached?.accounts ?? []);
  const [balances, setBalances] = useState<Record<string, number>>(cached?.balances ?? {});
  const [loading, setLoading] = useState(!cached);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownersById, setOwnersById] = useState<Map<string, SpaceOwnerSummary>>(cached?.ownersById ?? new Map());
  const [scope, setScope] = useState<string[]>(cached?.scope ?? []);
  const [allowedAccounts, setAllowedAccounts] = useState<Set<string>>(cached?.allowedAccounts ?? new Set());
  const [isShared, setIsShared] = useState(cached?.isShared ?? false);

  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;
    const existing = sessionData.get<AccountsCache>(`accounts:${spaceId}`);
    if (existing) {
      setAccounts(existing.accounts);
      setBalances(existing.balances);
      setOwnersById(existing.ownersById);
      setScope(existing.scope);
      setAllowedAccounts(existing.allowedAccounts);
      setIsShared(existing.isShared);
      setLoading(false);
    } else {
      setLoading(true);
    }
    getShareScope(spaceId).then(async ({ scope, allowedAccounts }) => {
      setScope(scope);
      setAllowedAccounts(new Set(allowedAccounts));
      const membersRes = await supabase
        .from("space_members")
        .select("user_id")
        .eq("space_id", spaceId);
      const hasOtherMembers = (membersRes.data ?? []).some(
        (m) => m.user_id !== profile?.id,
      );
      setIsShared(hasOtherMembers);
      const myAccountIds = await getMyAccountIds(profile?.id);
      const scopeFilter = spaceScopeFilter({ scopeIds: scope, myAccountIds, hasOtherMembers });
      let txQuery = supabase
        .from("transactions")
        .select("type, amount, account_id, to_account_id");
      if (scopeFilter) txQuery = txQuery.or(scopeFilter);
      else txQuery = txQuery.in("space_id", scope);
      Promise.all([
        supabase
          .from("accounts")
          .select("*")
          .order("created_at", { ascending: false }),
        txQuery,
        getUserOwners(),
      ]).then(([accRes, txRes, ownersMap]) => {
        setAccounts(accRes.data ?? []);
        setOwnersById(ownersMap);
        const map: Record<string, number> = {};
        (txRes.data ?? []).forEach((tx) => {
          const amount = Number(tx.amount) || 0;
          if (tx.type === "transfer") {
            if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) - amount;
            if (tx.to_account_id) map[tx.to_account_id] = (map[tx.to_account_id] ?? 0) + amount;
          } else if (tx.type === "income") {
            if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) + amount;
          } else {
            if (tx.account_id) map[tx.account_id] = (map[tx.account_id] ?? 0) - amount;
          }
        });
        setBalances(map);
        sessionData.set(`accounts:${spaceId}`, {
          accounts: accRes.data ?? [],
          balances: map,
          ownersById: ownersMap,
          scope,
          allowedAccounts: new Set(allowedAccounts),
          isShared: hasOtherMembers,
        });
        setLoading(false);
      });
    });
  }, [activeSpaceId]);

  const space = useAppStore((s) => s.getActiveSpace());
  const currency = space?.currency ?? "PEN";
  const sharedView = viewMode && isShared;

  const totalBalance = useMemo(
    () =>
      accounts
        .filter((a) =>
          sharedView
            ? allowedAccounts.has(a.id)
            : a.user_id === profile?.id,
        )
        .reduce((sum, a) => sum + (balances[a.id] ?? 0), 0),
    [accounts, balances, profile?.id, allowedAccounts, sharedView],
  );

  function openCreate() {
    setShowForm(true);
    setEditingId("");
    setName("");
    setType("cash");
    setColor(COLORS[0]);
    setIcon(null);
  }

  function openEdit(acc: Account) {
    setEditingId(acc.id);
    setName(acc.name);
    setType(acc.type);
    setColor(acc.color ?? COLORS[0]);
    setIcon(acc.icon);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSpaceId) return;
    setSaving(true);
    const payload = { name: name.trim(), type, color, icon: icon || null };
    if (editingId) {
      const { data } = await supabase
        .from("accounts")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (data) setAccounts(accounts.map((a) => (a.id === editingId ? data : a)));
    } else {
      const { data } = await supabase
        .from("accounts")
        .insert({ user_id: profile?.id, ...payload })
        .select()
        .single();
      if (data) setAccounts([data, ...accounts]);
    }
    openCreate();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("accounts.deleteConfirm"))) return;
    await supabase.from("accounts").delete().eq("id", id);
    setAccounts(accounts.filter((a) => a.id !== id));
  }

  const accountsByOwner = useMemo(
    () =>
      groupByUser(
        accounts.filter((a) =>
          sharedView
            ? allowedAccounts.has(a.id)
            : a.user_id === profile?.id,
        ),
        ownersById,
        profile?.id,
      ),
    [accounts, ownersById, profile?.id, allowedAccounts, sharedView],
  );

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <h1 className="text-lg font-bold text-gray-800">
          {t("accounts.title")}
        </h1>
        {!viewMode && (
          <div className="ml-auto">
            <button onClick={openCreate} className="btn-primary w-auto px-4 py-2 text-xs">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="bg-gradient-to-br from-accent to-accent-hover rounded-2xl p-5 text-white shadow-lg shadow-accent/30">
          <p className="text-sm opacity-80 mb-1">{t("accounts.totalBalance")}</p>
          <p className="text-2xl font-bold">{formatCurrency(totalBalance, currency)}</p>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm p-5 space-y-3 border border-gray-50"
        >
          <div className="flex items-center gap-3">
            <IconTile icon={icon} color={color} />
            <input
              type="text"
              placeholder={t("accounts.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
          >
            {(Object.keys(TYPE_KEYS) as AccountType[]).map((k) => (
              <option key={k} value={k}>
                {t(TYPE_KEYS[k] as any)}
              </option>
            ))}
          </select>
          <IconPicker value={icon} color={color} onChange={setIcon} />
          <ColorPicker value={color} onChange={setColor} />
          <button type="submit" disabled={saving} className="btn-primary">
            {saving
              ? t("common.saving")
              : editingId
                ? t("common.save")
                : t("accounts.create")}
          </button>
        </form>
      )}

      {accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t("accounts.empty")}
          description={t("accounts.emptyDesc")}
          action={
            <button onClick={openCreate} className="btn-primary w-auto px-6">
              {t("accounts.addFirst")}
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {accountsByOwner.map((group) => (
            <div key={group.owner.key}>
              {sharedView && (
                <div className="flex items-center gap-2 mb-2">
                  <UserBubble user={group.owner} size={20} />
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                    {group.owner.name}
                  </h3>
                </div>
              )}
              <div className="space-y-2">
                {group.items.map((acc) => {
                  const colorHex = acc.color ?? COLORS[0];
                  const Icon = ACCOUNT_TYPE_ICONS[acc.type];
                  const iconNode = acc.icon ? (
                    <IconTile icon={acc.icon} color={colorHex} />
                  ) : (
                    <span
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: colorHex + "20" }}
                    >
                      <Icon className="w-5 h-5" style={{ color: colorHex }} />
                    </span>
                  );
                  const balance = balances[acc.id] ?? 0;
                  const isOwn = acc.user_id === profile?.id;
                  const interactive = !viewMode && isOwn;
                  const onRowClick = () =>
                    navigate(`/account-detail?id=${acc.id}`);
                  return (
                    <div
                      key={acc.id}
                      onClick={onRowClick}
                      className={`bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-gray-50 cursor-pointer active:scale-[0.99] transition-transform ${viewMode ? "dark:bg-night-card dark:border-white/10" : ""}`}
                    >
                      {iconNode}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {acc.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {t(TYPE_KEYS[acc.type] as any)}
                        </p>
                        <p
                          className={`text-sm font-bold mt-1 ${balance >= 0 ? "text-income" : "text-expense"}`}
                        >
                          {formatCurrency(balance, currency)}
                        </p>
                      </div>
                      {interactive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(acc);
                          }}
                          className="p-2 text-gray-300 hover:text-accent transition-colors"
                          aria-label={t("common.edit")}
                        >
                          <PencilLine className="w-4 h-4" />
                        </button>
                      )}
                      {isOwn && !viewMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(acc.id);
                          }}
                          className="p-2 text-gray-300 hover:text-expense transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}