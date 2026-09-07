import { useTranslation } from "@/lib/i18n";
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
  Wallet,
  X,
} from "lucide-react";
import { AccountMiniIcon } from "./Dashboard";

interface Props {
  tx: any;
  currency: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function TransactionDetailModal({
  tx,
  currency,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const { t, locale } = useTranslation();

  if (!tx) return null;

  const isIncome = tx.type === "income";
  const isTransfer = tx.type === "transfer";
  const fromAccount = tx.accounts ?? tx.from_account;
  const toAccount = tx.to_accounts ?? tx.to_account;
  const owner = tx.profiles;
  const photos: string[] = Array.isArray(tx.photo_urls)
    ? tx.photo_urls
    : [];

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
                <p className="text-xs text-gray-400 mb-2">
                  {t("transactions.detailTransfer")}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AccountMiniIcon account={fromAccount} size={14} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {fromAccount?.name ?? "—"}
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-accent shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AccountMiniIcon account={toAccount} size={14} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {toAccount?.name ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              fromAccount && (
                <div className="flex items-center gap-3 p-4">
                  <AccountMiniIcon account={fromAccount} size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{t("add.account")}</p>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {fromAccount.name}
                    </p>
                  </div>
                </div>
              )
            )}
            <div className="flex items-center gap-3 p-4">
              <Wallet className="w-[18px] h-[18px] text-accent shrink-0" />
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