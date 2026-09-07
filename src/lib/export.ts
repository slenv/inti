import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const isNative = () => Capacitor.isNativePlatform()

function downloadWeb(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function shareFile(path: string, filename: string, mime: string): Promise<void> {
  const result = await Filesystem.getUri({ path, directory: Directory.Cache })
  await Share.share({
    title: filename,
    dialogTitle: filename,
    url: result.uri,
  })
}

async function persistFile(content: string, filename: string, mime: string, binary = false) {
  if (isNative()) {
    const data = binary
      ? content
      : // BOM para que Excel detecte UTF-8
        '\uFEFF' + content
    await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      encoding: binary ? undefined : Encoding.UTF8,
    })
    await shareFile(filename, filename, mime)
  } else {
    downloadWeb(content, filename, mime)
  }
}

export function downloadCsv(content: string, filename: string): Promise<void> {
  return persistFile(content, filename, 'text/csv;charset=utf-8;')
}

export function toCsv(rows: string[][], head: string[]): string {
  const esc = (v: any) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [head.map(esc).join(',')]
  rows.forEach((r) => lines.push(r.map(esc).join(',')))
  return lines.join('\n')
}

export async function exportPdf(opts: {
  rows: string[][]
  head: string[]
  title: string
  filename: string
}) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const ACCENT: [number, number, number] = [139, 114, 212]

  doc.setFillColor(245, 243, 255)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 76, 'F')
  doc.setTextColor(40)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(opts.title, 40, 40)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text(new Date().toLocaleString(), 40, 56)

  autoTable(doc, {
    head: [opts.head],
    body: opts.rows,
    startY: 92,
    styles: { fontSize: 9, cellPadding: 6, textColor: 60 },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 247, 252] },
    margin: { left: 40, right: 40, bottom: 46 },
    columnStyles: {
      [opts.head.length - 1]: { halign: 'right' },
    },
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo?.() ?? { pageNumber: 1 }
      const total = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(
        `Página ${page.pageNumber} de ${total}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 24,
        { align: 'center' },
      )
    },
  })

  try {
    const dataUri = doc.output('datauristring')
    const base64 = dataUri.split(',')[1] ?? ''
    await persistFile(base64, opts.filename, 'application/pdf', true)
  } catch {
    doc.save(opts.filename)
  }
}