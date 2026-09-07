export interface Profile {
  id: string
  name: string
  color: string
  avatar_url: string | null
}

export interface Space {
  id: string
  name: string
  invite_code: string
  currency: string
  created_by: string | null
  created_at: string
}

export interface SpaceMember {
  space_id: string
  user_id: string
  role: 'owner' | 'member'
}

export interface SpaceShare {
  space_id: string
  shared_space_id: string
  created_by: string | null
  created_at: string
}

export interface AccountShare {
  account_id: string
  space_id: string
  created_by: string | null
  created_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: 'cash' | 'bank' | 'digital_wallet' | 'savings' | 'other'
  icon: string | null
  color: string | null
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  type: 'income' | 'expense'
  icon: string | null
  color: string | null
}

export interface UserPreference {
  user_id: string
  excluded_balance_accounts: string[]
  updated_at: string
}

export interface Transaction {
  id: string
  space_id: string
  account_id: string | null
  to_account_id: string | null
  category_id: string | null
  user_id: string
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string | null
  date: string
  photo_urls: string[]
  created_at: string
}

export interface TransactionWithRelations extends Transaction {
  accounts?: Account | null
  to_accounts?: Account | null
  categories?: Category | null
  profiles?: Profile | null
}

export interface SpaceWithMembers extends Space {
  space_members: (SpaceMember & { profiles: Profile })[]
}

export const CURRENCY_MAP: Record<string, { symbol: string; nameKey: string }> = {
  PEN: { symbol: 'S/', nameKey: 'currency.PEN' },
  USD: { symbol: '$', nameKey: 'currency.USD' },
  EUR: { symbol: '€', nameKey: 'currency.EUR' },
  ARS: { symbol: 'AR$', nameKey: 'currency.ARS' },
  MXN: { symbol: 'MX$', nameKey: 'currency.MXN' },
  COP: { symbol: 'COL$', nameKey: 'currency.COP' },
  CLP: { symbol: 'CL$', nameKey: 'currency.CLP' },
  BRL: { symbol: 'R$', nameKey: 'currency.BRL' },
}

export const CURRENCIES = Object.keys(CURRENCY_MAP)

export function formatCurrency(amount: number, currencyCode: string): string {
  const currency = CURRENCY_MAP[currencyCode]
  const symbol = currency?.symbol ?? currencyCode
  return `${symbol} ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const COLORS = [
  '#8B72D4', '#4ADE80', '#FFD3B0', '#DC2626', '#16A34A',
  '#2563EB', '#EAB308', '#EA580C', '#D946EF', '#14B8A6',
  '#F43F5E', '#7C3AED', '#06B6D4', '#F97316', '#10B981',
]

export const ACCOUNT_TYPES = ['cash', 'bank', 'digital_wallet', 'savings', 'other'] as const
export type AccountType = typeof ACCOUNT_TYPES[number]
