import { useRef, useState, type ChangeEvent, type RefObject } from "react"
import { Camera, ImagePlus, Images, X } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

export default function PhotoAddButton({
  onAdd,
  disabled,
  label,
}: {
  onAdd: (files: File[]) => void
  disabled?: boolean
  label: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function pick(ref: RefObject<HTMLInputElement | null>) {
    setOpen(false)
    // Small delay so the sheet closes before the native picker opens (iOS).
    setTimeout(() => ref.current?.click(), 60)
  }

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ""
    if (files.length > 0) onAdd(files)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full py-3 rounded-xl border border-dashed border-accent/60 text-sm font-semibold text-accent flex items-center justify-center gap-2 transition-colors hover:bg-accent/5 disabled:opacity-40"
      >
        <ImagePlus className="w-4 h-4" /> {label}
      </button>

      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFiles} />

      {open && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl bg-white dark:bg-[#1A1D27] shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-white/10">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{t("add.photos")}</h2>
              <button onClick={() => setOpen(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => pick(cameraRef)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-accent" />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold text-gray-700 dark:text-gray-200">{t("add.takePhoto")}</span>
                  <span className="block text-xs text-gray-400">{t("add.takePhotoHint")}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => pick(galleryRef)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                  <Images className="w-5 h-5 text-accent" />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-semibold text-gray-700 dark:text-gray-200">{t("add.fromGallery")}</span>
                  <span className="block text-xs text-gray-400">{t("add.fromGalleryHint")}</span>
                </span>
              </button>
            </div>

            <div className="px-4 pb-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full py-3 rounded-xl bg-gray-100 dark:bg-white/10 text-sm font-semibold text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-200 dark:hover:bg-white/15"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}