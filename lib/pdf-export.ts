export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

type PdfReportOptions = {
  title: string
  subtitle?: string
  fileName: string
  bodyHtml: string
}

export type PdfReportAction = "print" | "save"

function buildPrintableHtml(options: PdfReportOptions, generatedAt: string, action: PdfReportAction): string {
  const title = escapeHtml(options.title)
  const subtitle = options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ""
  const downloadName = toPdfFileName(options.fileName)
  const saveButtonHtml = '<button type="button" class="secondary" id="save-btn">Download Report</button>'
  const toolbarTip =
    action === "save"
      ? "Download Report saves a PDF file directly; Print opens printer/PDF output."
      : "Use Print for printer/PDF output, or Download Report to save this report file directly."

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page { size: A4 portrait; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #0b1f3a; margin: 0; }
      h1 { margin: 0 0 6px; font-size: 24px; }
      .subtitle { margin: 0; color: #345f85; font-size: 13px; }
      .meta { margin-top: 6px; color: #5b7898; font-size: 12px; }
      .section { margin-top: 18px; }
      .section h2 { margin: 0 0 8px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #c5d5e6; padding: 6px 8px; text-align: left; font-size: 12px; vertical-align: top; }
      th { background: #edf3f9; color: #163a5a; }
      .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .kpi { border: 1px solid #c5d5e6; border-radius: 8px; padding: 8px 10px; background: #f7fbff; }
      .kpi .label { font-size: 11px; color: #345f85; text-transform: uppercase; }
      .kpi .value { margin-top: 4px; font-size: 18px; font-weight: 700; color: #0b1f3a; }
      ul { margin: 6px 0 0 18px; padding: 0; }
      li { font-size: 12px; margin: 4px 0; }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        margin-bottom: 12px;
        border: 1px solid #c5d5e6;
        border-radius: 10px;
        padding: 10px 12px;
        background: #f7fbff;
      }
      .toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
      .toolbar button {
        border: 1px solid #2e6ea0;
        background: #2e6ea0;
        color: #fff;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .toolbar button.secondary {
        border-color: #93aeca;
        background: #fff;
        color: #20466d;
      }
      .toolbar p { margin: 0; font-size: 12px; color: #345f85; }
      @media print {
        .toolbar { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div class="toolbar-actions">
        <button type="button" id="print-btn">Print</button>
        ${saveButtonHtml}
      </div>
      <p>${toolbarTip}</p>
    </div>
    <header>
      <h1>${title}</h1>
      ${subtitle}
      <p class="meta">Generated: ${escapeHtml(generatedAt)}</p>
    </header>
    ${options.bodyHtml}
    <script>
      (() => {
        const printButton = document.getElementById("print-btn");
        const saveButton = document.getElementById("save-btn");
        const downloadName = ${JSON.stringify(downloadName)};
        const triggerPrint = () => window.print();
        const triggerSave = () => {
          window.print();
        };
        if (printButton) {
          printButton.addEventListener("click", triggerPrint);
        }
        if (saveButton) {
          saveButton.addEventListener("click", triggerSave);
        }
      })();
    </script>
  </body>
</html>`
}

function toPdfFileName(fileName: string): string {
  if (/\.pdf$/i.test(fileName)) return fileName
  if (/\.html?$/i.test(fileName)) return fileName.replace(/\.html?$/i, ".pdf")
  return `${fileName}.pdf`
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

function sanitizePdfText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim()
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

type PdfColor = [number, number, number]

type ReportBlock =
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "kpis"; items: Array<{ label: string; value: string }> }
  | { kind: "table"; headers: string[]; rows: string[][] }

function wrapPdfTextByWidth(value: string, maxChars: number): string[] {
  const line = sanitizePdfText(value)
  if (!line) return []
  if (line.length <= maxChars) return [line]

  const wrapped: string[] = []
  let cursor = line
  while (cursor.length > maxChars) {
    const candidate = cursor.slice(0, maxChars + 1)
    let breakAt = candidate.lastIndexOf(" ")
    if (breakAt < Math.floor(maxChars * 0.45)) {
      breakAt = maxChars
    }
    wrapped.push(cursor.slice(0, breakAt).trimEnd())
    cursor = cursor.slice(breakAt).trimStart()
  }
  if (cursor) wrapped.push(cursor)
  return wrapped
}

function parseHtmlTable(table: HTMLTableElement): { headers: string[]; rows: string[][] } {
  const headerCells = Array.from(table.querySelectorAll("thead th")).map((cell) => sanitizePdfText(cell.textContent || ""))
  const bodyRows = Array.from(table.querySelectorAll("tbody tr")).map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) => sanitizePdfText(cell.textContent || ""))
  )

  if (headerCells.length > 0) {
    return { headers: headerCells, rows: bodyRows }
  }

  const allRows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("td, th")).map((cell) => sanitizePdfText(cell.textContent || ""))
  )

  if (allRows.length === 0) {
    return { headers: [], rows: [] }
  }

  return { headers: allRows[0], rows: allRows.slice(1) }
}

function parseReportBlocks(html: string): ReportBlock[] {
  const blocks: ReportBlock[] = []

  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    doc.querySelectorAll("script, style, .toolbar").forEach((node) => node.remove())

    const header = doc.querySelector("header")
    if (header) {
      const title = sanitizePdfText(header.querySelector("h1")?.textContent || "")
      const subtitle = sanitizePdfText(header.querySelector(".subtitle")?.textContent || "")
      const meta = sanitizePdfText(header.querySelector(".meta")?.textContent || "")
      if (title) blocks.push({ kind: "title", text: title })
      if (subtitle) blocks.push({ kind: "subtitle", text: subtitle })
      if (meta) blocks.push({ kind: "meta", text: meta })
    }

    const sections = Array.from(doc.querySelectorAll("section.section"))
    for (const section of sections) {
      const heading = sanitizePdfText(section.querySelector(":scope > h2")?.textContent || "")
      if (heading) {
        blocks.push({ kind: "heading", text: heading })
      }

      const kpis = Array.from(section.querySelectorAll(".kpi-grid .kpi"))
        .map((kpi) => ({
          label: sanitizePdfText(kpi.querySelector(".label")?.textContent || ""),
          value: sanitizePdfText(kpi.querySelector(".value")?.textContent || ""),
        }))
        .filter((item) => item.label || item.value)
      if (kpis.length > 0) {
        blocks.push({ kind: "kpis", items: kpis })
      }

      const bullets = Array.from(section.querySelectorAll("ul li"))
        .map((item) => sanitizePdfText(item.textContent || ""))
        .filter(Boolean)
      if (bullets.length > 0) {
        blocks.push({ kind: "bullets", items: bullets })
      }

      const tables = Array.from(section.querySelectorAll("table"))
      for (const table of tables) {
        const parsed = parseHtmlTable(table)
        if (parsed.headers.length > 0 || parsed.rows.length > 0) {
          blocks.push({ kind: "table", headers: parsed.headers, rows: parsed.rows })
        }
      }

      const paragraphs = Array.from(section.querySelectorAll(":scope > p"))
        .map((item) => sanitizePdfText(item.textContent || ""))
        .filter(Boolean)
      for (const paragraph of paragraphs) {
        blocks.push({ kind: "paragraph", text: paragraph })
      }
    }

    if (blocks.length > 0) {
      return blocks
    }
  } catch {
    // fall through to plain-text fallback
  }

  const fallbackText = sanitizePdfText(html.replace(/<[^>]+>/g, " "))
  return fallbackText ? [{ kind: "paragraph", text: fallbackText }] : [{ kind: "paragraph", text: "Report generated with no printable content." }]
}

class StyledPdfBuilder {
  private readonly pageWidth = 595
  private readonly pageHeight = 842
  private readonly marginLeft = 40
  private readonly marginRight = 40
  private readonly marginTop = 42
  private readonly marginBottom = 42
  private readonly contentWidth = this.pageWidth - this.marginLeft - this.marginRight
  private readonly pages: string[][] = [[]]
  private cursorTop = this.marginTop

  private rgb(color: PdfColor): string {
    return color.map((part) => (part / 255).toFixed(3)).join(" ")
  }

  private currentPage(): string[] {
    return this.pages[this.pages.length - 1]
  }

  private emit(command: string): void {
    this.currentPage().push(command)
  }

  private toPdfY(top: number, height = 0): number {
    return this.pageHeight - top - height
  }

  private ensureSpace(height: number): void {
    const nextTop = this.cursorTop + height
    if (nextTop > this.pageHeight - this.marginBottom) {
      this.pages.push([])
      this.cursorTop = this.marginTop
    }
  }

  private estimateChars(width: number, fontSize: number): number {
    return Math.max(10, Math.floor(width / (fontSize * 0.56)))
  }

  private drawText(text: string, x: number, top: number, fontSize: number, font: "F1" | "F2", color: PdfColor): void {
    const cleanText = sanitizePdfText(text)
    if (!cleanText) return
    const y = this.toPdfY(top, fontSize)
    this.emit(`q
${this.rgb(color)} rg
BT
/${font} ${fontSize} Tf
1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm
(${escapePdfString(cleanText)}) Tj
ET
Q`)
  }

  private drawRect(
    x: number,
    top: number,
    width: number,
    height: number,
    options: { fill?: PdfColor; stroke?: PdfColor; strokeWidth?: number } = {}
  ): void {
    const y = this.toPdfY(top, height)
    const commands: string[] = ["q"]
    if (options.fill) {
      commands.push(`${this.rgb(options.fill)} rg`)
      commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`)
    }
    if (options.stroke) {
      commands.push(`${this.rgb(options.stroke)} RG`)
      commands.push(`${(options.strokeWidth || 1).toFixed(2)} w`)
      commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`)
    }
    commands.push("Q")
    this.emit(commands.join("\n"))
  }

  private drawLine(x1: number, top1: number, x2: number, top2: number, color: PdfColor, width = 1): void {
    const y1 = this.toPdfY(top1)
    const y2 = this.toPdfY(top2)
    this.emit(`q
${this.rgb(color)} RG
${width.toFixed(2)} w
${x1.toFixed(2)} ${y1.toFixed(2)} m
${x2.toFixed(2)} ${y2.toFixed(2)} l
S
Q`)
  }

  private drawWrappedText(
    text: string,
    options: {
      x?: number
      width?: number
      fontSize: number
      font: "F1" | "F2"
      color: PdfColor
      lineGap?: number
      spaceAfter?: number
    }
  ): void {
    const x = options.x ?? this.marginLeft
    const width = options.width ?? this.contentWidth
    const lineGap = options.lineGap ?? 3
    const lines = wrapPdfTextByWidth(text, this.estimateChars(width, options.fontSize))
    if (lines.length === 0) return

    const lineHeight = options.fontSize + lineGap
    this.ensureSpace(lines.length * lineHeight)
    lines.forEach((line, index) => {
      this.drawText(line, x, this.cursorTop + index * lineHeight, options.fontSize, options.font, options.color)
    })
    this.cursorTop += lines.length * lineHeight + (options.spaceAfter ?? 4)
  }

  private drawKpiGrid(items: Array<{ label: string; value: string }>): void {
    if (items.length === 0) return

    const columns = 2
    const gap = 10
    const cardWidth = (this.contentWidth - gap) / columns
    const rowCount = Math.ceil(items.length / columns)

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowItems = items.slice(rowIndex * columns, rowIndex * columns + columns)
      const cardLayouts = rowItems.map((item) => {
        const labelLines = wrapPdfTextByWidth(item.label, this.estimateChars(cardWidth - 16, 9))
        const valueLines = wrapPdfTextByWidth(item.value, this.estimateChars(cardWidth - 16, 15))
        const labelHeight = Math.max(1, labelLines.length) * 12
        const valueHeight = Math.max(1, valueLines.length) * 18
        return { item, labelLines, valueLines, height: labelHeight + valueHeight + 16 }
      })

      const rowHeight = Math.max(...cardLayouts.map((layout) => layout.height))
      this.ensureSpace(rowHeight)
      const top = this.cursorTop

      cardLayouts.forEach((layout, columnIndex) => {
        const x = this.marginLeft + columnIndex * (cardWidth + gap)
        this.drawRect(x, top, cardWidth, rowHeight, {
          fill: [247, 251, 255],
          stroke: [197, 213, 230],
          strokeWidth: 1,
        })

        const labelTop = top + 6
        layout.labelLines.forEach((line, index) => {
          this.drawText(line, x + 8, labelTop + index * 12, 9, "F1", [52, 95, 133])
        })

        const valueTop = labelTop + Math.max(1, layout.labelLines.length) * 12 + 2
        layout.valueLines.forEach((line, index) => {
          this.drawText(line, x + 8, valueTop + index * 18, 15, "F2", [11, 31, 58])
        })
      })

      this.cursorTop += rowHeight + 8
    }
  }

  private drawTable(headers: string[], rows: string[][]): void {
    const columnCount = Math.max(1, headers.length, ...rows.map((row) => row.length))
    const normalizedHeaders = (headers.length > 0 ? headers : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`)).slice(0, columnCount)
    const normalizedRows = rows.map((row) => [...row, ...Array.from({ length: columnCount - row.length }, () => "")].slice(0, columnCount))

    const columnWidths = Array.from({ length: columnCount }, () => this.contentWidth / columnCount)
    const tableLeft = this.marginLeft
    const borderColor: PdfColor = [197, 213, 230]
    const headerFill: PdfColor = [237, 243, 249]
    const padX = 4
    const padY = 3

    const drawRow = (cells: string[], isHeader: boolean): void => {
      const fontSize = isHeader ? 10 : 9
      const lineHeight = fontSize + 3
      const wrappedByCell = cells.map((value, index) =>
        wrapPdfTextByWidth(value, this.estimateChars(columnWidths[index] - padX * 2, fontSize))
      )
      const maxLines = Math.max(1, ...wrappedByCell.map((lines) => lines.length || 1))
      const rowHeight = maxLines * lineHeight + padY * 2

      this.ensureSpace(rowHeight)
      const rowTop = this.cursorTop
      this.drawRect(tableLeft, rowTop, this.contentWidth, rowHeight, {
        fill: isHeader ? headerFill : undefined,
        stroke: borderColor,
        strokeWidth: 1,
      })

      let dividerX = tableLeft
      for (let i = 0; i < columnWidths.length - 1; i += 1) {
        dividerX += columnWidths[i]
        this.drawLine(dividerX, rowTop, dividerX, rowTop + rowHeight, borderColor, 1)
      }

      let textX = tableLeft
      wrappedByCell.forEach((cellLines, cellIndex) => {
        const lines = cellLines.length > 0 ? cellLines : [""]
        lines.forEach((line, lineIndex) => {
          this.drawText(
            line,
            textX + padX,
            rowTop + padY + lineIndex * lineHeight,
            fontSize,
            isHeader ? "F2" : "F1",
            isHeader ? [22, 58, 90] : [42, 68, 105]
          )
        })
        textX += columnWidths[cellIndex]
      })

      this.cursorTop += rowHeight
    }

    drawRow(normalizedHeaders, true)
    normalizedRows.forEach((row) => drawRow(row, false))
    this.cursorTop += 10
  }

  addBlocks(blocks: ReportBlock[]): void {
    blocks.forEach((block) => {
      switch (block.kind) {
        case "title":
          this.drawWrappedText(block.text, {
            fontSize: 24,
            font: "F2",
            color: [11, 31, 58],
            lineGap: 5,
            spaceAfter: 2,
          })
          break
        case "subtitle":
          this.drawWrappedText(block.text, {
            fontSize: 12,
            font: "F1",
            color: [52, 95, 133],
            spaceAfter: 2,
          })
          break
        case "meta":
          this.drawWrappedText(block.text, {
            fontSize: 10,
            font: "F1",
            color: [91, 120, 152],
            spaceAfter: 10,
          })
          break
        case "heading":
          this.drawWrappedText(block.text, {
            fontSize: 16,
            font: "F2",
            color: [11, 31, 58],
            lineGap: 4,
            spaceAfter: 6,
          })
          break
        case "paragraph":
          this.drawWrappedText(block.text, {
            fontSize: 11,
            font: "F1",
            color: [42, 68, 105],
            spaceAfter: 6,
          })
          break
        case "bullets":
          block.items.forEach((item) => {
            this.drawWrappedText(`- ${item}`, {
              fontSize: 11,
              font: "F1",
              color: [32, 66, 109],
              x: this.marginLeft + 6,
              width: this.contentWidth - 6,
              spaceAfter: 3,
            })
          })
          this.cursorTop += 4
          break
        case "kpis":
          this.drawKpiGrid(block.items)
          break
        case "table":
          this.drawTable(block.headers, block.rows)
          break
      }
    })
  }

  toBlob(): Blob {
    const pageCount = this.pages.length
    const firstPageObject = 5
    const objects: string[] = new Array(firstPageObject + pageCount * 2)
    const pageRefs = Array.from({ length: pageCount }, (_, index) => `${firstPageObject + index * 2} 0 R`).join(" ")

    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>"
    objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

    this.pages.forEach((pageCommands, index) => {
      const pageObjectNumber = firstPageObject + index * 2
      const contentObjectNumber = pageObjectNumber + 1
      const stream = pageCommands.join("\n")

      objects[contentObjectNumber] = `<< /Length ${byteLength(stream)} >>
stream
${stream}
endstream`
      objects[pageObjectNumber] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    })

    let pdf = "%PDF-1.4\n"
    let offset = byteLength(pdf)
    const offsets: number[] = [0]

    for (let index = 1; index < objects.length; index += 1) {
      const objectBody = `${index} 0 obj\n${objects[index]}\nendobj\n`
      offsets[index] = offset
      pdf += objectBody
      offset += byteLength(objectBody)
    }

    const xrefOffset = offset
    pdf += `xref
0 ${objects.length}
0000000000 65535 f 
`
    for (let index = 1; index < objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n 
`
    }
    pdf += `trailer
<< /Size ${objects.length} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`

    return new Blob([pdf], { type: "application/pdf" })
  }
}

function buildStyledPdfBlob(html: string): Blob {
  const blocks = parseReportBlocks(html)
  const builder = new StyledPdfBuilder()
  builder.addBlocks(blocks)
  return builder.toBlob()
}

function downloadReportDocument(html: string, fileName: string): boolean {
  try {
    const downloadName = toPdfFileName(fileName)
    const blob = buildStyledPdfBlob(html)
    const reportUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = reportUrl
    anchor.download = downloadName
    anchor.rel = "noopener"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(reportUrl), 1500)
    return true
  } catch {
    return false
  }
}

function tryIframePrint(html: string): boolean {
  try {
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.style.visibility = "hidden"
    document.body.appendChild(iframe)

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove()
      }, 800)
    }

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow
      if (!frameWindow) {
        cleanup()
        return
      }
      frameWindow.focus()
      frameWindow.print()
      cleanup()
    }

    iframe.srcdoc = html
    return true
  } catch {
    return false
  }
}

export function openPrintablePdfReport(options: PdfReportOptions, action: PdfReportAction = "print"): void {
  if (typeof window === "undefined") {
    return
  }

  const generatedAt = new Date().toLocaleString()
  const html = buildPrintableHtml(options, generatedAt, action)

  if (action === "save" && downloadReportDocument(html, options.fileName)) {
    return
  }

  if (action === "print" && tryIframePrint(html)) {
    return
  }

  if (action === "save") {
    window.alert("Unable to download the report file. Please try again.")
    return
  }

  window.alert("Unable to start printing. Please try again.")
}
