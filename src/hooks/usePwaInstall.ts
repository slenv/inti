import { useEffect, useState } from 'react'

export function useStandalone() {
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const detect = () => {
      setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
    }
    detect()
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener?.('change', detect)
    return () => {
      mq.removeEventListener?.('change', detect)
    }
  }, [])

  return isStandalone
}