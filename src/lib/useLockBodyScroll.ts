import { useEffect, useRef } from 'react'

let lockCount = 0
let savedOverflow = ''

function lock() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

function unlock() {
  if (lockCount <= 0) return
  lockCount--
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow
    savedOverflow = ''
  }
}

export function useLockBodyScroll(locked: boolean, onEscape?: () => void) {
  const cbRef = useRef(onEscape)
  cbRef.current = onEscape

  useEffect(() => {
    if (!locked) return
    lock()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cbRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      unlock()
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [locked])
}