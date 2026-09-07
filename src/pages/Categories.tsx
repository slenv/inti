import EmptyState from "@/components/EmptyState";
import ColorPicker from "@/components/ColorPicker";
import IconPicker, { IconTile } from "@/components/IconPicker";
import { useTranslation } from "@/lib/i18n";
import { sessionData } from "@/lib/sessionState";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type { Category } from "@/types/database";
import { COLORS } from "@/types/database";
import { getIcon } from "@/lib/icons";
import { getShareScope, getUserOwners, groupByUser, type SpaceOwnerSummary } from "@/lib/shared";
import UserBubble from "@/components/UserBubble";
import { ArrowLeft, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

interface CategoriesCache {
  categories: Category[];
  ownersById: Map<string, SpaceOwnerSummary>;
  scope: string[];
}

export default function Categories() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSpaceId, spaces, profile } = useAppStore();
  const cached = sessionData.get<CategoriesCache>(`categories:${activeSpaceId ?? "none"}`);
  const [categories, setCategories] = useState<Category[]>(cached?.categories ?? []);
  const [loading, setLoading] = useState(!cached);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownersById, setOwnersById] = useState<Map<string, SpaceOwnerSummary>>(cached?.ownersById ?? new Map());
  const [scope, setScope] = useState<string[]>(cached?.scope ?? []);

  useEffect(() => {
    if (!activeSpaceId) {
      setLoading(spaces.length === 0);
      return;
    }
    const spaceId = activeSpaceId;
    const existing = sessionData.get<CategoriesCache>(`categories:${spaceId}`);
    if (existing) {
      setCategories(existing.categories);
      setOwnersById(existing.ownersById);
      setScope(existing.scope);
      setLoading(false);
    } else {
      setLoading(true);
    }
    getShareScope(spaceId).then(({ scope }) => {
      setScope(scope);
      Promise.all([
        supabase.from("categories").select("*"),
        getUserOwners(),
      ]).then(([catRes, ownersMap]) => {
        const cats = catRes.data ?? [];
        setCategories(cats);
        setOwnersById(ownersMap);
        sessionData.set(`categories:${spaceId}`, {
          categories: cats,
          ownersById: ownersMap,
          scope,
        });
        setLoading(false);
      });
    });
  }, [activeSpaceId]);

  function openCreate() {
    setShowForm(true);
    setEditingId("");
    setName("");
    setType("expense");
    setColor(COLORS[0]);
    setIcon(null);
  }

  function openEdit(cat: Category) {
    setEditingId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color ?? COLORS[0]);
    setIcon(cat.icon);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSpaceId) return;
    setSaving(true);
    const payload = { name: name.trim(), type, color, icon: icon || null };
    if (editingId) {
      const { data } = await supabase
        .from("categories")
        .update(payload)
        .eq("id", editingId)
        .select()
        .single();
      if (data)
        setCategories(categories.map((c) => (c.id === editingId ? data : c)));
    } else {
      const { data } = await supabase
        .from("categories")
        .insert({ user_id: profile?.id, ...payload })
        .select()
        .single();
      if (data) setCategories([data, ...categories]);
    }
    openCreate();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("categories.deleteConfirm"))) return;
    await supabase.from("categories").delete().eq("id", id);
    setCategories(categories.filter((c) => c.id !== id));
  }

  const categoriesByOwner = useMemo(
    () => groupByUser(categories, ownersById, profile?.id),
    [categories, ownersById, profile?.id],
  );
  const isShared = scope.length > 1;

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
          {t("categories.title")}
        </h1>
        <div className="ml-auto">
          <button onClick={openCreate} className="btn-primary w-auto px-4 py-2 text-xs">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm p-5 space-y-3 border border-gray-50"
        >
          <div className="flex items-center gap-3">
            <IconTile icon={icon} color={color} size="sm" />
            <input
              type="text"
              placeholder={t("categories.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:border-accent"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm"
          >
            <option value="expense">{t("categories.expense")}</option>
            <option value="income">{t("categories.income")}</option>
          </select>
          <IconPicker value={icon} color={color} onChange={setIcon} />
          <ColorPicker value={color} onChange={setColor} />
          <button type="submit" disabled={saving} className="btn-primary">
            {saving
              ? t("common.saving")
              : editingId
                ? t("common.save")
                : t("categories.create")}
          </button>
        </form>
      )}

      {categories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={t("categories.empty")}
          description={t("categories.emptyDesc")}
          action={
            <button onClick={openCreate} className="btn-primary w-auto px-6">
              {t("categories.addFirst")}
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {categoriesByOwner.map((group) => {
            const income = group.items.filter((c) => c.type === "income");
            const expense = group.items.filter((c) => c.type === "expense");
            return (
              <div key={group.owner.key}>
                {isShared && (
                  <div className="flex items-center gap-2 mb-2">
                    <UserBubble user={group.owner} size={20} />
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                      {group.owner.name}
                    </h3>
                  </div>
                )}
                <div className="space-y-4">
                  {income.length > 0 && (
                    <CategoryGroup
                      title={t("categories.incomes")}
                      items={income}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      ownUserId={profile?.id}
                    />
                  )}
                  {expense.length > 0 && (
                    <CategoryGroup
                      title={t("categories.expenses")}
                      items={expense}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      ownUserId={profile?.id}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  title,
  items,
  onEdit,
  onDelete,
  ownUserId,
}: {
  title: string;
  items: Category[];
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
  ownUserId: string | null | undefined;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-2">
        {items.map((cat) => {
          const colorHex = cat.color ?? COLORS[0];
          const Icon = getIcon(cat.icon);
          const isOwn = cat.user_id === ownUserId;
          return (
            <div
              key={cat.id}
              onClick={isOwn ? () => onEdit(cat) : undefined}
              className={`bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 border border-gray-50 ${isOwn ? "cursor-pointer active:scale-[0.99] transition-transform" : ""}`}
            >
              {cat.icon ? (
                <IconTile icon={cat.icon} color={colorHex} size="sm" />
              ) : (
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: colorHex + "20" }}
                >
                  <Icon className="w-4 h-4" style={{ color: colorHex }} />
                </span>
              )}
              <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                {cat.name}
              </span>
              {isOwn && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(cat.id);
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
  );
}