import { useEffect, useRef } from 'react'

const GRADIENT = 'linear-gradient(90deg, #8B72D4, #B8A9E8, #7A62C2)'

let counter = 0

export function startProgress() {
  window.dispatchEvent(new CustomEvent('app:progress-start'))
}

export function finishProgress() {
  window.dispatchEvent(new CustomEvent('app:progress-done'))
}

export function failProgress() {
  window.dispatchEvent(new CustomEvent('app:progress-fail'))
}

export default function TopProgress() {
  const barRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const show = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      bar.style.visibility = 'visible'
      bar.style.opacity = '1'
      bar.style.background = GRADIENT
      bar.style.transition = 'none'
      bar.style.width = '0%'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bar.style.transition = 'width 4s cubic-bezier(0.3, 0.6, 0.35, 1)'
          bar.style.width = '62%'
        })
      })
      timerRef.current = window.setTimeout(() => {
        bar.style.transition = 'width 2s cubic-bezier(0.3, 0.6, 0.35, 1)'
        bar.style.width = '84%'
      }, 3200)
    }

    const done = (color?: string) => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      bar.style.transition = 'none'
      bar.style.width = '100%'
      bar.style.background = color ?? GRADIENT
      bar.style.opacity = '1'
      window.setTimeout(() => {
        bar.style.transition = 'opacity 0.4s ease'
        bar.style.opacity = '0'
        bar.style.width = '100%'
      }, 240)
    }

    const onStart = () => {
      counter += 1
      if (counter === 1) show()
    }
    const onDone = () => {
      counter = Math.max(0, counter - 1)
      if (counter === 0) done()
    }
    const onFail = () => {
      counter = 0
      done('#DC2626')
    }

    window.addEventListener('app:progress-start', onStart)
    window.addEventListener('app:progress-done', onDone)
    window.addEventListener('app:progress-fail', onFail)
    return () => {
      window.removeEventListener('app:progress-start', onStart)
      window.removeEventListener('app:progress-done', onDone)
      window.removeEventListener('app:progress-fail', onFail)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="fixed top-0 inset-x-0 h-[3px] z-[100] pointer-events-none" style={{ visibility: 'hidden', opacity: 0 }}>
      <div ref={barRef} className="h-full rounded-r-full" style={{ width: '0%', background: GRADIENT }} />
    </div>
  )
}