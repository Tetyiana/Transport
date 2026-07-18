import { PDFDocument } from 'pdf-lib'

// Накладає печатку і підпис на останню сторінку PDF
export async function stampPdf(pdfBytes, stampBytes, signBytes, pos = 'right') {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const page = doc.getPage(doc.getPageCount() - 1)
  const { width } = page.getSize()
  const isPng = (b) => b && b[0] === 0x89
  const embed = (b) => isPng(b) ? doc.embedPng(b) : doc.embedJpg(b)
  const y = 60
  const xBase = pos === 'left' ? 45 : pos === 'center' ? width / 2 - 90 : width - 215
  if (stampBytes) {
    const img = await embed(stampBytes)
    const w = 145, h = img.height / img.width * 145
    page.drawImage(img, { x: xBase, y, width: w, height: h, opacity: 0.85 })
  }
  if (signBytes) {
    const img = await embed(signBytes)
    const w = 115, h = img.height / img.width * 115
    page.drawImage(img, { x: xBase + 35, y: y + 20, width: w, height: h })
  }
  return doc.save()
}
