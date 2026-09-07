// Clasificación de transacciones como ingreso/egreso según la frontera del
// espacio:
// - En un ESPACIO PERSONAL las cuentas "del espacio" son las del usuario
//   logueado: una transferencia de otro usuario hacia mi cuenta es INGRESO,
//   y una de mi cuenta hacia otro usuario es EGRESO. Entre mis cuentas, neutra.
// - En un ESPACIO COMPARTIDO el dinero es del espacio: las transferencias
//   entre cuentas compartidas al espacio (allowedAccounts) son NEUTRAS, pero
//   si el dinero ENTRA al espacio desde cuentas no compartidas / usuarios
//   ajenos es INGRESO, y si SALE del espacio hacia esas cuentas es EGRESO.
// La regla se decide por la frontera: origen y destino dentro → neutro;
// entra de afuera → ingreso; sale hacia afuera → egreso.

export type TxKind = "income" | "expense" | "transfer" | "other";

export interface FlowClass {
  isIncome: boolean;
  isExpense: boolean;
}

export interface FlowCtx {
  /** Id del usuario logueado (define el "afuera" en espacios personales). */
  currentUserId?: string;
  /** true si la transacción pertenece a un espacio compartido. */
  isShared?: boolean;
  /** Cuentas compartidas al espacio (definen la frontera en compartidos). */
  allowedAccounts?: Set<string>;
  /** Resolución opcional de cuentas planas (ej. accountsById?.get). */
  getAccount?: (id: string) => any;
}

function isInside(tx: any, ctx: FlowCtx, accId?: string, joined?: any): boolean {
  const acc = joined ?? (accId ? ctx.getAccount?.(accId) : undefined);
  if (!acc) return false;
  // En espacios compartidos, "dentro" son las cuentas compartidas al espacio.
  if (ctx.isShared) return !!ctx.allowedAccounts?.has(acc.id);
  return !!acc.user_id && acc.user_id === ctx.currentUserId;
}

/**
 * Clasifica una transacción respecto a la frontera del espacio.
 * @param tx transacción (con accounts/to_accounts resueltos o plana).
 */
export function classifyFlow(tx: any, ctx: FlowCtx = {}): FlowClass {
  if (tx.type === "income") return { isIncome: true, isExpense: false };
  if (tx.type === "expense") return { isIncome: false, isExpense: true };
  if (tx.type !== "transfer") return { isIncome: false, isExpense: false };

  const from = tx.accounts ?? ctx.getAccount?.(tx.account_id);
  const to = tx.to_accounts ?? ctx.getAccount?.(tx.to_account_id);

  const srcInside = isInside(tx, ctx, tx.account_id, from);
  const dstInside = isInside(tx, ctx, tx.to_account_id, to);

  // El dinero ENTRA al espacio desde afuera → ingreso.
  if (!srcInside && dstInside) return { isIncome: true, isExpense: false };
  // El dinero SALE del espacio hacia afuera → egreso.
  if (srcInside && !dstInside) return { isIncome: false, isExpense: true };
  // Ambos dentro (o ambos fuera) → neutro.
  return { isIncome: false, isExpense: false };
}

/**
 * Suma los ingresos/egresos efectivos de una lista de transacciones
 * según la frontera del espacio.
 */
export function computeFlowTotals(
  txs: any[],
  ctx: FlowCtx = {},
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    const amt = Number(tx.amount) || 0;
    const { isIncome, isExpense } = classifyFlow(tx, ctx);
    if (isIncome) income += amt;
    else if (isExpense) expense += amt;
  }
  return { income, expense };
}