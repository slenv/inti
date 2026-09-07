import {
  Banknote,
  Briefcase,
  Building2,
  Bus,
  Car,
  Circle,
  Coins,
  CreditCard,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Music,
  PiggyBank,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  TrainFront,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { AccountType } from '@/types/database'
import { supabase } from '@/lib/supabase'

export const ICON_MAP: Record<string, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  'credit-card': CreditCard,
  coins: Coins,
  'piggy-bank': PiggyBank,
  landmark: Landmark,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  car: Car,
  bus: Bus,
  train: TrainFront,
  plane: Plane,
  home: Home,
  'building-2': Building2,
  briefcase: Briefcase,
  laptop: Laptop,
  smartphone: Smartphone,
  music: Music,
  'gamepad-2': Gamepad2,
  gift: Gift,
  'heart-pulse': HeartPulse,
  stethoscope: Stethoscope,
  'graduation-cap': GraduationCap,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  tag: Tag,
}

export const ICON_KEYS = Object.keys(ICON_MAP)

export const ACCOUNT_TYPE_ICONS: Record<AccountType, LucideIcon> = {
  cash: Wallet,
  bank: Landmark,
  digital_wallet: Smartphone,
  savings: PiggyBank,
  other: Circle,
}

export function getIcon(name?: string | null): LucideIcon {
  return (name && ICON_MAP[name]) || Circle
}

export function isImageIcon(icon?: string | null): icon is string {
  return (
    !!icon &&
    (icon.startsWith('http') ||
      icon.startsWith('data:') ||
      icon.startsWith('icons/'))
  )
}

export function resolveIconSrc(icon: string): string {
  if (icon.startsWith('http') || icon.startsWith('data:')) return icon
  return supabase.storage.from('icons').getPublicUrl(icon).data.publicUrl
}

export const DEFAULT_COLOR = '#8B72D4'