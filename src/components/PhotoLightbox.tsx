import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Minimize2, X, ZoomIn } from "lucide-react"
import { useLockBodyScroll } from "@/lib/useLockBodyScroll"

interface Drag {
  x: number
  y: number
  startX: number
  startY: number
  axis: "x" | "y"
}

const SWIPE_THRESHOLD = 80
const CLOSE_THRESHOLD = 130
const TAP_ZOOM = 2.5

export default function PhotoLightbox({
  photos,
  open,
  initialIndex = 0,
  onClose,
}: {
  photos: string[]
  open: boolean
  initialIndex?: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  useLockBodyScroll(open, onClose)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [closing, setClosing] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const gesture = useRef<{
    x: number
    y: number
    panStart: { x: number; y: number }
    bounds: { maxX: number; maxY: number }
  } | null>(null)
  const lastTapRef = useRef(0)

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = i + dir
        return next < 0 || next >= photos.length ? i : next
      })
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setDrag(null)
    },
    [photos.length],
  )

  useEffect(() => {
    if (open) {
      setIndex(initialIndex)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setDrag(null)
      setClosing(false)
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = ""
      }
    }
  }, [open, initialIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") go(1)
      if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, go])

  if (!open || photos.length === 0) return null

  const isZoomed = zoom > 1

  function clamp(v: number, min: number, max: number) {
    return Math.min(Math.max(v, min), max)
  }

  function ptDist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function getBounds(z: number) {
    const rect = areaRef.current?.getBoundingClientRect()
    return {
      maxX: ((z - 1) * (rect?.width ?? 300)) / 2,
      maxY: ((z - 1) * (rect?.height ?? 400)) / 2,
    }
  }

  function syncPointer(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    syncPointer(e)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: ptDist(a, b), zoom }
      gesture.current = null
      setDrag(null)
    } else {
      gesture.current = { x: e.clientX, y: e.clientY, panStart: { ...pan }, bounds: getBounds(zoom) }
      setDrag({ x: 0, y: 0, startX: e.clientX, startY: e.clientY, axis: "y" })
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pinch.current) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size !== 2) return
      const [a, b] = [...pointers.current.values()]
      const next = clamp(pinch.current.zoom * (ptDist(a, b) / pinch.current.dist), 1, 3)
      setZoom(next)
      setPan({ x: 0, y: 0 })
      return
    }
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (isZoomed) {
      setPan({
        x: clamp(g.panStart.x + dx, -g.bounds.maxX, g.bounds.maxX),
        y: clamp(g.panStart.y + dy, -g.bounds.maxY, g.bounds.maxY),
      })
    } else if (drag) {
      const axis = drag.axis === "y" && Math.abs(dx) > Math.abs(dy) ? "x" : drag.axis
      setDrag({ ...drag, x: dx, y: dy, axis })
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)

    if (pinch.current) {
      if (pointers.current.size === 1) {
        const [pid, p] = [...pointers.current.entries()][0]
        gesture.current = { x: p.x, y: p.y, panStart: { ...pan }, bounds: getBounds(zoom) }
        setDrag(null)
      } else if (pointers.current.size === 0) {
        pinch.current = null
        setDrag(null)
      }
      return
    }

    const g = gesture.current
    gesture.current = null
    const d = drag
    setDrag(null)
    if (!g || !d) return

    if (isZoomed) {
      return
    }

    const { x, y, axis } = d
    if (axis === "y" && Math.abs(y) > CLOSE_THRESHOLD) {
      setClosing(true)
      setTimeout(onClose, 220)
      return
    }
    if (axis === "x") {
      if (x < -SWIPE_THRESHOLD) go(1)
      else if (x > SWIPE_THRESHOLD) go(-1)
      return
    }

    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      setZoom((z) => (z > 1 ? 1 : TAP_ZOOM))
      setPan({ x: 0, y: 0 })
      lastTapRef.current = 0
      return
    }
    lastTapRef.current = now
  }

  const translateX = isZoomed ? pan.x : (drag?.x ?? 0)
  const translateY = isZoomed ? pan.y : (drag?.y ?? 0)
  const isDragging = !!drag && !isZoomed

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-sm"
      style={{
        transform: closing ? "translateY(8%) scale(0.98)" : "translateY(0) scale(1)",
        opacity: closing ? 0 : 1,
        transition: closing ? "transform .22s ease, opacity .22s ease" : "none",
      }}
      onClick={() => !isZoomed && !closing && onClose()}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 z-10" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs font-semibold text-white/80 bg-white/10 px-3 py-1 rounded-full">
          {index + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setZoom((z) => (z > 1 ? 1 : TAP_ZOOM))
              setPan({ x: 0, y: 0 })
            }}
            aria-label="zoom"
            className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            {isZoomed ? <Minimize2 className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            aria-label="close"
            className="p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={areaRef}
        className="relative flex-1 overflow-hidden touch-none select-none w-full"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="h-full w-full flex items-center justify-center"
          style={{
            transform: `translate(${translateX}px, ${translateY}px)`,
            transition: isDragging || pinch.current ? "none" : "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)",
            opacity: !isZoomed && drag?.axis === "y" ? String(1 - Math.min(1, Math.abs(drag.y) / 400)) : undefined,
          }}
        >
          <img
            key={index}
            src={photos[index]}
            alt=""
            draggable={false}
            className={`max-h-full max-w-full object-contain select-none ${!isDragging ? (index === initialIndex ? "" : index > initialIndex ? "animate-slide-in-right" : "animate-slide-in-left") : ""}`}
            style={{
              transform: `scale(${zoom})`,
              cursor: isZoomed ? "grab" : "zoom-in",
            }}
          />
        </div>

        {/* Side arrows */}
        {!isZoomed && photos.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                go(-1)
              }}
              disabled={index === 0}
              aria-label="previous"
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30 z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                go(1)
              }}
              disabled={index === photos.length - 1}
              aria-label="next"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30 z-10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Footer: thumbnails + hint */}
      <div className="px-4 pt-2 pb-4 z-10 flex flex-col items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && (
          <div className="flex justify-center gap-2">
            {photos.map((p, i) => (
              <button
                key={i}
                onClick={() => {
                  setIndex(i)
                  setZoom(1)
                  setPan({ x: 0, y: 0 })
                }}
                className={`w-11 h-11 rounded-lg overflow-hidden border-2 transition-all ${i === index ? "border-white scale-105" : "border-transparent opacity-50"}`}
              >
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-white/45 font-medium">{isZoomed ? zoom.toFixed(1) + "x" : "◉"}</p>
      </div>
    </div>,
    document.body,
  )
}