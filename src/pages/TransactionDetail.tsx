import { useTranslation } from "@/lib/i18n";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
import { formatCurrency } from "@/types/database";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  Pencil,
  Trash2,
  User,
  X,
} from "lucide-react";
import { AccountMiniIcon } from "./Dashboard";

interface Props {
  tx: any;
  currency: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  ownersById?: Map<string, any>;
  currentUserId?: string;
  currentProfile?: { name: string; color: string; avatar_url: string | null } | null;
}

export default function TransactionDetailModal({
  tx,
  currency,
  onClose,
  onEdit,
  onDelete,
  ownersById,
  currentUserId,
  currentProfile,
}: Props) {
  const { t, locale } = useTranslation();

  useLockBodyScroll(!!tx, onClose);

  if (!tx) return null;

  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";
  const fromAccount = tx.accounts ?? tx.from_account;
  const toAccount = tx.to_accounts ?? tx.to_account;
  const owner = tx.profiles;
  const photos: string[] = Array.isArray(tx.photo_urls)
    ? tx.photo_urls
    : [];

  const ownerFor = (account: any) => {
    if (!account?.user_id) return undefined;
    return account.user_id === currentUserId
      ? (currentProfile ?? undefined)
      : ownersById?.get(account.user_id);
  };
  const fromOwner = ownerFor(fromAccount);
  const toOwner = ownerFor(toAccount);
  const bothMine =
    !!currentUserId &&
    fromAccount?.user_id === currentUserId &&
    toAccount?.user_id === currentUserId;
  const bothOwnedBySameOther =
    !bothMine &&
    !!fromOwner &&
    !!toOwner &&
    fromAccount?.user_id === toAccount?.user_id;

  const title = isTransfer
    ? `${fromAccount?.name ?? "—"} → ${toAccount?.name ?? "—"}`
    : tx.categories?.name ?? tx.description ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full lg:max-w-md max-h-[88dvh] flex flex-col rounded-t-3xl lg:rounded-3xl bg-white dark:bg-night-card shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">
            {isIncome
              ? t("transactions.incomes")
              : isTransfer
                ? t("add.transfer")
                : t("transactions.expenses")}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
          <div
            className={`bg-gradient-to-br rounded-2xl p-5 text-white shadow-lg ${isTransfer ? "from-accent to-accent-hover" : isIncome ? "from-income to-income/80" : "from-expense to-expense/80"}`}
          >
            <p className="text-sm opacity-80 mb-1 truncate flex items-center gap-1">
              {isTransfer ? (
                <>
                  <ArrowLeftRight className="w-4 h-4 shrink-0" /> {t("add.transfer")}
                </>
              ) : (
                title || (isIncome ? t("add.income") : t("add.expense"))
              )}
            </p>
            <p className="text-2xl font-bold">
              {isTransfer ? "→ " : isIncome ? "+" : "-"}
              {formatCurrency(Number(tx.amount), currency)}
            </p>
          </div>

          {owner && (
            <div className="bg-gray-50 dark:bg-night-input rounded-2xl p-4 flex items-center gap-3">
              {owner.avatar_url ? (
                <img
                  src={owner.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
                  style={{ backgroundColor: owner.color ?? "#9CA3AF" }}
                >
                  {owner.name?.charAt(0).toUpperCase() ?? "—"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">
                  {t("transactions.detailOwner")}
                </p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
                  {owner.name}
                </p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 dark:bg-night-input rounded-2xl divide-y divide-gray-100 dark:divide-white/10">
            {isTransfer ? (
              <div className="p-4">
                {bothMine || bothOwnedBySameOther ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                      <span className="truncate">
                        {fromAccount?.name ?? "—"}
                      </span>
                      <ArrowRight className="w-4 h-4 text-accent shrink-0" />
                      <span className="truncate">{toAccount?.name ?? "—"}</span>
                    </div>
                    <p className="mt-2 text-center text-xs font-semibold text-accent">
                      {bothMine
                        ? t("transactions.betweenOwnAccounts")
                        : fromOwner?.name
                          ? t("transactions.betweenOwnAccountsOf", {
                              name: fromOwner.name,
                            })
                          : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-stretch gap-3">
                      <div className="flex-1 min-w-0 bg-white dark:bg-night-card rounded-xl border border-gray-100 dark:border-white/10 p-3 flex flex-col justify-center">
                        {fromOwner && (
                          <div className="flex items-center gap-2 mb-2">
                            {fromOwner.avatar_url ? (
                              <img
                                src={fromOwner.avatar_url}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover shadow-sm shrink-0"
                              />
                            ) : (
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0"
                                style={{
                                  backgroundColor: fromOwner.color ?? "#9CA3AF",
                                }}
                              >
                                {fromOwner.name?.charAt(0).toUpperCase() ?? "—"}
                              </div>
                            )}
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
                              {fromOwner.name ?? "—"}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <AccountMiniIcon account={fromAccount} size={14} />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                            {fromAccount?.name ?? "—"}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center">
                        <ArrowRight className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0 bg-white dark:bg-night-card rounded-xl border border-gray-100 dark:border-white/10 p-3 flex flex-col justify-center">
                        {toOwner && (
                          <div className="flex items-center gap-2 mb-2">
                            {toOwner.avatar_url ? (
                              <img
                                src={toOwner.avatar_url}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover shadow-sm shrink-0"
                              />
                            ) : (
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0"
                                style={{
                                  backgroundColor: toOwner.color ?? "#9CA3AF",
                                }}
                              >
                                {toOwner.name?.charAt(0).toUpperCase() ?? "—"}
                              </div>
                            )}
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
                              {toOwner.name ?? "—"}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <AccountMiniIcon account={toAccount} size={14} />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                            {toAccount?.name ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              fromAccount && (
                <div className="flex items-center gap-3 p-4">
                  <AccountMiniIcon account={fromAccount} size={14} />
                  <div className="flex-1 min-w-0">
                    {fromOwner && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {fromOwner.avatar_url ? (
                          <img
                            src={fromOwner.avatar_url}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                            style={{
                              backgroundColor: fromOwner.color ?? "#9CA3AF",
                            }}
                          >
                            {fromOwner.name?.charAt(0).toUpperCase() ?? "—"}
                          </div>
                        )}
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-300 truncate">
                          {fromOwner.name ?? "—"}
                        </span>
                      </div>
                    )}
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {fromAccount.name}
                    </p>
                  </div>
                </div>
              )
            )}
            <div className="flex items-center gap-3 p-4">
              <Calendar className="w-[18px] h-[18px] text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">
                  {t("transactions.detailDate")}
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {format(new Date(tx.date), "EEEE d MMM yyyy · h:mm a", {
                    locale: locale === "es" ? esLocale : undefined,
                  })}
                </p>
              </div>
            </div>
            {tx.description && (
              <div className="p-4">
                <p className="text-xs text-gray-400 mb-1">
                  {t("add.description")}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  {tx.description}
                </p>
              </div>
            )}
          </div>

          {photos.length > 0 && (
            <div className="bg-gray-50 dark:bg-night-input rounded-2xl p-4">
              <p className="text-xs text-gray-400 mb-2">
                {t("transactions.photos")}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <img
                    key={p}
                    src={p}
                    alt=""
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 dark:border-white/10">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white text-sm font-semibold active:opacity-80 transition"
              >
                <Pencil className="w-4 h-4" /> {t("common.edit")}
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-expense text-white text-sm font-semibold active:opacity-80 transition ${onEdit ? "" : ""}`}
              >
                <Trash2 className="w-4 h-4" /> {t("common.delete")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}