export default function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return <img src="/favicon.svg" alt="Inti" draggable={false} className={className} />
}