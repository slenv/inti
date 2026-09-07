import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/types/database'

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-lg px-3 py-2 border border-gray-100">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs font-semibold" style={{ color: p.color }}>
          {formatCurrency(Number(p.value), currency)}
        </p>
      ))}
    </div>
  )
}

type DonutEntry = {
  id: string
  name: string
  value: number
  color: string
  owner: { name: string; color: string; avatar_url: string | null } | null
}

export function CategoryDonut({ data, currency, showOwners = false }: { data: DonutEntry[]; currency: string; showOwners?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={55} strokeWidth={2} stroke="#fff" isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2.5 max-h-44 overflow-y-auto pr-1 overscroll-contain">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-gray-500 block truncate">{item.name}</span>
              {showOwners && item.owner && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400 truncate">
                  {item.owner.avatar_url ? (
                    <img src={item.owner.avatar_url} alt="" className="w-3 h-3 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-3 h-3 rounded-full flex items-center justify-center text-[6px] text-white font-bold shrink-0"
                      style={{ backgroundColor: item.owner.color }}
                    >
                      {item.owner.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {item.owner.name}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-700 shrink-0">{formatCurrency(item.value, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MonthlyBars({ data, currency }: { data: { month: string; income: number; expense: number }[]; currency: string }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4}>
          <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Bar dataKey="income" fill="#16A34A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" fill="#DC2626" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}