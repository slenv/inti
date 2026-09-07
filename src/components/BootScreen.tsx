import Logo from './Logo'

export default function BootScreen() {
  return (
    <div className="min-h-screen bg-[#faf9ff] dark:bg-night flex flex-col items-center justify-center">
      <Logo className="w-16 h-16 boot-pulse" />
    </div>
  )
}