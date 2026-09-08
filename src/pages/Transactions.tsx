import EmptyState from "@/components/EmptyState";
import ItemPicker, { type PickerGroup, type PickerItem } from "@/components/ItemPicker";
import DateTimePicker from "@/components/DateTimePicker";
import PeriodSelector from "@/components/PeriodSelector";
import UserBubble from "@/components/UserBubble";
import PhotoAddButton from "@/components/PhotoAddButton";
import PhotoLightbox from "@/components/PhotoLightbox";
import SwipeableRow from "@/components/SwipeableRow";
import { finishProgress, startProgress } from "@/components/TopProgress";
import { downloadCsv, exportPdf, toCsv } from "@/lib/export";
import { computeFlowTotals } from "@/lib/flow";
import { useTranslation } from "@/lib/i18n";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import { formatCurrency } from "@/types/database";
import { COLORS } from "@/types/database";
import { IconTile } from "@/components/IconPicker";
import {
  ACCOUNT_TYPE_ICONS,
  DEFAULT_COLOR,
  getIcon,
} from "@/lib/icons";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { fromRange, periodRange, type Period } from "@/lib/period";
import { getShareScope, getUserOwners, getMyAccountIds, spaceScopeFilter, type SpaceOwnerSummary } from "@/lib/shared";
import { formatTime12 } from "@/lib/time";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

interface PhotoDraft {
  id: string;
  file: File;
  preview: string;
}

const MAX_PHOTOS = 5;
const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function removePhotoFromStorage(url: string) {
  const path = url.split("/transaction-photos/")[1];
  if (!path) return;
  supabase.storage.from("transaction-photos").remove([path]);
}

interface TransactionsCache {
  transactions: any[];
  allowedAccounts: Set<string>;
  hasOtherMembers: boolean;
}

const txDataKey = (spaceId: string | null, from: string, to: string) =>
  `transactions:${spaceId ?? "none"}:${from}:${to}`;

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

  // Inline edit state
  const [editingId, setEditingId] = useState("");
  const [editingType, setEditingType] = useState<EditType>("expense");
  const [editingAmount, setEditingAmount] = useState(0);
  const [editingDate, setEditingDate] = useState("");
  const [editingTime, setEditingTime] = useState("09:00");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingAccountId, setEditingAccountId] = useState("");
  const [editingToAccountId, setEditingToAccountId] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingPhotos, setEditingPhotos] = useState<string[]>([]);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<PhotoDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<number | null>(null);
  const [editPicker, setEditPicker] = useState<"" | "category" | "account" | "toAccount">("");
  const [detailTx, setDetailTx] = useState<any | null>(null);

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

  // Transacciones: acotadas al rango de fecha de los filtros.
  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;

    async function loadTransactions() {
      // Refresco silencioso: si ya hay datos para este espacio+rango, no mostrar skeleton.
      const existing = sessionData.get<TransactionsCache>(txDataKey(spaceId, filters.from, filters.to));
      if (existing) {
        setTransactions(existing.transactions);
        setAllowedAccounts(existing.allowedAccounts);
        setHasOtherMembers(existing.hasOtherMembers);
        setLoading(false);
      } else {
        setLoading(true);
      }
      const isInitial = transactions.length === 0;
      if (isInitial) startProgress();

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
        setHasOtherMembers(hasOtherMembers);
        const myAccountIds = await getMyAccountIds(profile?.id);
        const scopeFilter = spaceScopeFilter({ scopeIds, myAccountIds, hasOtherMembers });
        let query = supabase
          .from("transactions")
          .select(
            "*, profiles(name, color, avatar_url), categories(name, color, type), accounts!transactions_account_id_fkey(id, user_id, name, icon, color, type), to_accounts: accounts!transactions_to_account_id_fkey(id, user_id, name, icon, color, type)",
          )
          .order("date", { ascending: false });
        if (scopeFilter) query = query.or(scopeFilter);
        else query = query.in("space_id", scopeIds);

        if (filters.from) query = query.gte("date", filters.from);
        if (filters.to) query = query.lte("date", filters.to);

        const { data, error: txError } = await query;
        if (txError) setFetchError(t("transactions.loadError"));
        else setFetchError(null);
        const rowData = data ?? [];
        const filteredData =
          hasOtherMembers && allowedSet.size
            ? rowData.filter(
                (tx) => allowedSet.has(tx.account_id) || (tx.to_account_id && allowedSet.has(tx.to_account_id)),
              )
            : rowData;
        setTransactions(filteredData);
        sessionData.set(txDataKey(spaceId, filters.from, filters.to), {
          transactions: filteredData,
          allowedAccounts: allowedSet,
          hasOtherMembers,
        });
      } catch {
        setFetchError(t("transactions.loadError"));
      } finally {
        setLoading(false);
        if (isInitial) finishProgress();
      }
    }
    loadTransactions();
  }, [activeSpaceId, filters.from, filters.to]);

  // Populate the edit form whenever a transaction is selected for editing
  useEffect(() => {
    if (!editingId) return;
    const tx = transactions.find((tx) => tx.id === editingId);
    if (!tx) return;
    setEditingType(tx.type as EditType);
    setEditingAmount(tx.amount);
    setEditingDate(format(new Date(tx.date), "yyyy-MM-dd"));
    setEditingTime(format(new Date(tx.date), "HH:mm"));
    setEditingCategoryId(tx.category_id ?? "");
    setEditingAccountId(tx.account_id ?? "");
    setEditingToAccountId(tx.to_account_id ?? "");
    setEditingDescription(tx.description ?? "");
    setEditingPhotos(Array.isArray(tx.photo_urls) ? tx.photo_urls : []);
    setRemovedPhotos([]);
    setNewPhotos([]);
    setError(null);
  }, [editingId, transactions]);

  // Guarda la posición de scroll antes de abrir el editor inline y la
  // restaura al cancelar el formulario, en lugar de volver al tope.
  const editScrollRef = useRef(0);
  const cameFromHomeRef = useRef(false);

  function openInlineEdit(id: string) {
    editScrollRef.current = window.scrollY;
    cameFromHomeRef.current = false;
    setEditingId(id);
  }

  function closeInlineEdit() {
    if (cameFromHomeRef.current) {
      // Venía del Home (swipe): regresar y restaurar su posición.
      navigate("/");
      return;
    }
    const saved = editScrollRef.current;
    setEditingId("");
    requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "instant" }));
  }

  // Al llegar desde el Home con "editar" (swipe), abre la edición inline.
  useEffect(() => {
    const editId = (location.state as any)?.editTxId;
    if (editId) {
      cameFromHomeRef.current = true;
      editScrollRef.current = window.scrollY;
      setEditingId(editId);
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
  const { income: totalIncome, expense: totalExpense } = computeFlowTotals(
    filtered,
    {
      currentUserId: profile?.id,
      isShared: isSharedSpace,
      allowedAccounts,
      getAccount: (id) => accountsById.get(id),
    },
  );

  // Balance total: mismo criterio que el Home. Se calcula el saldo por cuenta
  // (las transfers restan del origen y suman al destino) y se suman las cuentas
  // propias (o permitidas si es un espacio compartido). Así, mover plata de un
  // lado a otro no cambia el total.
  const balanceTotal = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((tx) => {
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
      isSharedSpace ? allowedAccounts.has(a.id) : a.user_id === profile?.id,
    );
    return visibleAccounts.reduce((s, a) => s + (map[a.id] ?? 0), 0);
  }, [filtered, allAccounts, isSharedSpace, allowedAccounts, profile?.id]);
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
  }

  function addPhotos(files: File[]) {
    const free = MAX_PHOTOS - (editingPhotos.length - removedPhotos.length + newPhotos.length);
    if (free <= 0) return;
    const picked = files.slice(0, free);
    setNewPhotos((prev) => [
      ...prev,
      ...picked.map((file) => ({ id: uid(), file, preview: URL.createObjectURL(file) })),
    ]);
  }

  function removeEditingPhoto(url: string) {
    setRemovedPhotos((prev) => [...prev, url]);
  }

  function restoreEditingPhoto(url: string) {
    setRemovedPhotos((prev) => prev.filter((u) => u !== url));
  }

  function removeNewPhoto(id: string) {
    setNewPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadNewPhotos(): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < newPhotos.length; i++) {
      const p = newPhotos[i];
      const ext = p.file.name.split(".").pop() || "jpg";
      const path = `${activeSpaceId}/${editingId}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from("transaction-photos").upload(path, p.file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("transaction-photos").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  async function handleUpdateTx(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingAmount || editingAmount <= 0) {
      setError(t("add.amountError"));
      return;
    }
    if (editingType === "transfer") {
      if (!editingAccountId || !editingToAccountId) {
        setError(t("add.transferAccountsError"));
        return;
      }
      if (editingAccountId === editingToAccountId) {
        setError(t("add.transferSameAccount"));
        return;
      }
    } else if (!editingAccountId) {
      setError(t("add.accountError"));
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const uploaded = await uploadNewPhotos();
      if (removedPhotos.length > 0) {
        removedPhotos.forEach(removePhotoFromStorage);
      }
      const remainingExisting = editingPhotos.filter((url) => !removedPhotos.includes(url));
      const finalPhotos = [...remainingExisting, ...uploaded];

      const [y, m, d] = editingDate.split("-").map((v) => parseInt(v, 10));
      const [hh, mm] = (editingTime || "09:00").split(":").map((v) => parseInt(v, 10) || 0);
      const date = new Date(y, m - 1, d, hh, mm, 0, 0);

      const updates: Record<string, unknown> = {
        amount: editingAmount,
        type: editingType,
        description: editingDescription || null,
        date: date.toISOString(),
        account_id: editingAccountId,
        to_account_id: editingType === "transfer" ? editingToAccountId : null,
        category_id: editingType === "transfer" ? null : (editingCategoryId || null),
        photo_urls: finalPhotos,
      };

      const { error: updateError } = await supabase
        .from("transactions")
        .update(updates)
        .eq("id", editingId);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setTransactions((prev) =>
        prev.map((tx) => (tx.id === editingId ? { ...tx, ...updates } : tx)),
      );
      closeInlineEdit();
    } catch (err: any) {
      setError(err?.message || t("add.photoUploadError"));
    } finally {
      setIsPending(false);
    }
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
        <div className="h-5 w-28 rounded bg-gray-100 animate-pulse" />
        <div className="h-11 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-14 rounded-xl bg-gray-100 animate-pulse" />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-50 divide-y divide-gray-50">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 rounded bg-gray-100 animate-pulse" />
                <div className="h-2.5 w-1/3 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="h-3 w-14 rounded bg-gray-100 animate-pulse" />
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

  const photoCount = editingPhotos.filter((u) => !removedPhotos.includes(u)).length + newPhotos.length;
  const viewablePhotos = [
    ...editingPhotos.filter((u) => !removedPhotos.includes(u)),
    ...newPhotos.map((p) => p.preview),
  ];

  const selectedEditCategory = categories.find((c) => c.id === editingCategoryId);
  const selectedEditAccount = accounts.find((a) => a.id === editingAccountId);
  const selectedEditToAccount = accounts.find((a) => a.id === editingToAccountId);

  const categoryIconNode = (c: any, size: "sm" | "md" = "md") =>
    c?.icon ? (
      <IconTile icon={c.icon} color={c.color ?? DEFAULT_COLOR} size={size} />
    ) : (
      <span
        className={`${size === "sm" ? "w-8 h-8 rounded-lg" : "w-9 h-9 rounded-xl"} flex items-center justify-center shrink-0`}
        style={{ backgroundColor: (c?.color ?? DEFAULT_COLOR) + "20" }}
      >
        <Tag className="w-4 h-4" style={{ color: c?.color ?? DEFAULT_COLOR }} />
      </span>
    );

  const accountIconNode = (a: any, size: "sm" | "md" = "md") => {
    if (a?.icon) return <IconTile icon={a.icon} color={a.color ?? DEFAULT_COLOR} size={size} />;
    const Icon = ACCOUNT_TYPE_ICONS[(a?.type as import("@/types/database").AccountType) ?? "cash"] ?? getIcon(null);
    const box = size === "sm" ? "w-8 h-8 rounded-lg" : "w-9 h-9 rounded-xl";
    const colorHex = a?.color ?? DEFAULT_COLOR;
    return (
      <span
        className={`${box} flex items-center justify-center shrink-0`}
        style={{ backgroundColor: colorHex + "20" }}
      >
        <Icon className="w-4 h-4" style={{ color: colorHex }} />
      </span>
    );
  };

  const editCategoryItems: PickerItem[] = categories
    .filter((c) => c.type === editingType)
    .map((c) => ({
      id: c.id,
      name: c.name,
      sub: c.type === "expense" ? t("add.expense") : t("add.income"),
      icon: categoryIconNode(c),
    }));

  const editAccountItems: PickerItem[] = accounts
    .filter((a) => a.id !== editingToAccountId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      sub: "",
      icon: accountIconNode(a),
    }));

  const editToAccountGroups: PickerGroup[] = [
    {
      key: "me",
      label: (
        <span className="text-[13px] font-semibold text-gray-500 truncate">
          {t("add.myAccounts")}
        </span>
      ),
      items: accounts
        .filter((a) => a.id !== editingAccountId)
        .map((a) => ({
          id: a.id,
          name: a.name,
          sub: "",
          icon: accountIconNode(a),
        })),
    },
    ...[...owners.entries()]
      .filter(([uid]) => uid !== profile?.id)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .flatMap(([uid, owner]) => {
        const items = allAccounts.filter((a) => a.user_id === uid && a.id !== editingAccountId);
        if (items.length === 0) return [];
        return [
          {
            key: uid,
            label: (
              <div className="flex items-center gap-2">
                <UserBubble user={owner} size={20} />
                <span className="text-[13px] font-semibold text-gray-500 truncate">
                  {owner.name}
                </span>
              </div>
            ),
            items: items.map((a) => ({
              id: a.id,
              name: a.name,
              sub: "",
              icon: accountIconNode(a),
            })),
          },
        ];
      }),
  ];

  async function createCategories(name: string, opts?: { icon?: string | null; color?: string }): Promise<PickerItem | null> {
    if (!activeSpaceId) return null;
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: profile?.id,
        name,
        type: editingType as any,
        icon: opts?.icon ?? null,
        color: opts?.color ?? COLORS[0],
      })
      .select()
      .single();
    if (error || !data) return null;
    setCategories((prev) => [...prev, data]);
    return { id: data.id, name: data.name };
  }

  async function createAccounts(name: string, opts?: { icon?: string | null; color?: string }): Promise<PickerItem | null> {
    if (!activeSpaceId) return null;
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        user_id: profile?.id,
        name,
        type: "cash",
        icon: opts?.icon ?? null,
        color: opts?.color ?? COLORS[0],
      })
      .select()
      .single();
    if (error || !data) return null;
    setAccounts((prev) => [...prev, data]);
    return { id: data.id, name: data.name };
  }

  function EditPickerRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
    return (
      <button
        type="button"
        onClick={onPress}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-night-input border border-gray-200 dark:border-white/10 transition-colors hover:border-accent"
      >
        {icon}
        <span className="flex-1 text-left min-w-0">
          <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
          <span className={`block text-sm truncate ${value ? "text-gray-700 dark:text-gray-200 font-medium" : "text-gray-400"}`}>
            {value || "—"}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-500 shrink-0" />
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {t("transactions.title")}
        </h1>
        {editingId ? (
          <button
            onClick={closeInlineEdit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 text-gray-500 text-xs font-semibold active:scale-[0.97] transition-transform"
          >
            <X className="w-4 h-4" /> {t("common.cancel")}
          </button>
        ) : (
          <button
            onClick={() => navigate("/add")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold shadow-md shadow-accent/25 active:scale-[0.97] transition-transform"
          >
            <Plus className="w-4 h-4" /> {t("transactions.addNew")}
          </button>
        )}
      </div>

      {editingId ? (
        <form
          onSubmit={handleUpdateTx}
          className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 p-5 space-y-4"
        >
          {error && (
            <div className="bg-expense-light border border-expense/20 text-expense text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              {t("add.amount")} ({space?.currency})
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={editingAmount}
              onChange={(e) =>
                setEditingAmount(parseFloat(e.target.value) || 0)
              }
              className="w-full text-3xl font-bold text-gray-800 dark:text-gray-100 text-center py-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input focus:border-accent outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowDatePicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-input transition-colors hover:border-accent"
          >
            <Calendar className="w-[18px] h-[18px] text-gray-400 shrink-0" />
            <span className="flex-1 text-left">
              <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {t("add.dateTime")}
              </span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                {editingDate} · {formatTime12(editingTime, locale)}
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-500 shrink-0" />
          </button>

          <div className="grid grid-cols-3 gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1">
            {(
              [
                { key: "expense", label: t("add.expense"), active: "bg-expense text-white shadow-sm" },
                { key: "income", label: t("add.income"), active: "bg-income text-white shadow-sm" },
                { key: "transfer", label: t("add.transfer"), active: "bg-accent text-white shadow-sm" },
              ] as { key: EditType; label: string; active: string }[]
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setEditingType(opt.key);
                  setError(null);
                  if (opt.key === "transfer") setEditingCategoryId("");
                  else setEditingToAccountId("");
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  editingType === opt.key ? opt.active : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {editingType !== "transfer" && (
            <EditPickerRow
              icon={categoryIconNode(selectedEditCategory)}
              label={t("add.category")}
              value={selectedEditCategory?.name ?? ""}
              onPress={() => setEditPicker("category")}
            />
          )}

          <EditPickerRow
            icon={accountIconNode(selectedEditAccount)}
            label={editingType === "transfer" ? t("add.fromAccount") : t("add.account")}
            value={selectedEditAccount?.name ?? ""}
            onPress={() => setEditPicker("account")}
          />

          {editingType === "transfer" && (
            <EditPickerRow
              icon={accountIconNode(selectedEditToAccount)}
              label={t("add.toAccount")}
              value={selectedEditToAccount?.name ?? ""}
              onPress={() => setEditPicker("toAccount")}
            />
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              {t("add.description")}
            </label>
            <textarea
              placeholder={t("add.description")}
              rows={2}
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent resize-none dark:bg-night-input"
            />
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2 flex items-center justify-between">
              <span>{t("add.photos")}</span>
              <span className="text-[11px]">{photoCount}/{MAX_PHOTOS}</span>
            </p>
            {photoCount > 0 && (
              <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                {editingPhotos
                  .filter((url) => !removedPhotos.includes(url))
                  .map((url) => (
                    <SwipeableRow key={url} className="rounded-2xl" plain onDelete={() => removeEditingPhoto(url)}>
                      <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100 dark:ring-white/10 group cursor-pointer">
                        <img
                          src={url}
                          alt=""
                          className="w-full h-full object-cover"
                          onClick={() => setPhotoViewer(viewablePhotos.indexOf(url))}
                        />
                        <button
                          type="button"
                          onClick={() => removeEditingPhoto(url)}
                          aria-label="remove photo"
                          className="show-on-hover absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/80 backdrop-blur-sm"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </SwipeableRow>
                  ))}
                {removedPhotos.map((url) => (
                  <div key={url} className="relative aspect-square rounded-2xl overflow-hidden border border-expense/40 opacity-50 shadow-inner">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => restoreEditingPhoto(url)}
                      aria-label="restore photo"
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-white text-[11px] font-semibold"
                    >
                      <span className="px-2 py-1 rounded-full bg-white/20 backdrop-blur-sm">{t("common.undo")}</span>
                    </button>
                  </div>
                ))}
                {newPhotos.map((p) => (
                  <SwipeableRow key={p.id} className="rounded-2xl" plain onDelete={() => removeNewPhoto(p.id)}>
                    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-sm ring-1 ring-gray-100 dark:ring-white/10 group cursor-pointer">
                      <img
                        src={p.preview}
                        alt=""
                        className="w-full h-full object-cover"
                        onClick={() => setPhotoViewer(viewablePhotos.indexOf(p.preview))}
                      />
                      <button
                        type="button"
                        onClick={() => removeNewPhoto(p.id)}
                        aria-label="remove photo"
                        className="show-on-hover absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white hover:bg-black/80 backdrop-blur-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </SwipeableRow>
                ))}
              </div>
            )}
            <PhotoAddButton
              onAdd={addPhotos}
              disabled={photoCount >= MAX_PHOTOS || isPending}
              label={t("add.addPhotos")}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">{t("add.photosHint")}</p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={
              editingType === "expense"
                ? "btn-danger w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
                : editingType === "income"
                  ? "bg-income hover:bg-green-700 text-white w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 shadow-md shadow-income/25 active:scale-[0.98]"
                  : "bg-accent hover:bg-accent-hover text-white w-full py-3 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 shadow-md shadow-accent/25 active:scale-[0.98]"
            }
          >
            {isPending ? t("common.saving") : t("add.save")}
          </button>
        </form>
      ) : (
        <>
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
                  className={`text-2xl font-bold mt-1 ${balanceTotal >= 0 ? "text-income" : "text-expense"}`}
                >
                  {formatCurrency(balanceTotal, currency)}
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
                  {formatCurrency(totalIncome, currency)}
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
                  {formatCurrency(totalExpense, currency)}
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
            <div
              className="bg-white dark:bg-night-card rounded-2xl shadow-sm border border-gray-50 dark:border-white/10 overflow-hidden"
            >
              {filtered.map((tx) => {
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
                    onEdit={() => openInlineEdit(tx.id)}
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
        </>
      )}

      <PhotoLightbox
        photos={viewablePhotos}
        open={photoViewer !== null && viewablePhotos.length > 0}
        initialIndex={photoViewer ?? 0}
        onClose={() => setPhotoViewer(null)}
      />

      <DateTimePicker
        open={showDatePicker}
        setOpen={setShowDatePicker}
        date={editingDate}
        time={editingTime}
        onConfirm={(d, tm) => {
          setEditingDate(d);
          setEditingTime(tm);
        }}
      />

      <ItemPicker
        open={editPicker === "category"}
        onCreate={createCategories}
        items={editCategoryItems}
        onSelect={(id) => {
          setEditingCategoryId(id);
          setEditPicker("");
        }}
        onClose={() => setEditPicker("")}
        title={t("add.category")}
        searchPlaceholder={t("add.category")}
        addLabel={t("add.newCategory")}
        newNamePlaceholder={t("add.newCategoryName")}
        emptyText={t("add.noCategory")}
      />

      <ItemPicker
        open={editPicker === "account"}
        onCreate={createAccounts}
        items={editAccountItems}
        onSelect={(id) => {
          setEditingAccountId(id);
          setEditPicker("");
        }}
        onClose={() => setEditPicker("")}
        title={t("add.fromAccount")}
        searchPlaceholder={t("add.fromAccount")}
        addLabel={t("add.newAccount")}
        newNamePlaceholder={t("add.newAccountName")}
        emptyText={t("add.noAccount")}
      />

      <ItemPicker
        open={editPicker === "toAccount"}
        onCreate={createAccounts}
        groups={editToAccountGroups}
        onSelect={(id) => {
          setEditingToAccountId(id);
          setEditPicker("");
        }}
        onClose={() => setEditPicker("")}
        title={t("add.toAccount")}
        searchPlaceholder={t("add.toAccount")}
        addLabel={t("add.newAccount")}
        newNamePlaceholder={t("add.newAccountName")}
        emptyText={t("add.noAccount")}
      />

      <TransactionDetailModal
        tx={detailTx}
        currency={currency}
        onClose={() => setDetailTx(null)}
        onEdit={
          detailTx && spaces.some((s) => s.id === detailTx.space_id)
            ? () => {
                openInlineEdit(detailTx.id);
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