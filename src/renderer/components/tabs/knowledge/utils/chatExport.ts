import { AthenaExportEntry } from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildAthenaExportDocument(title: string, entries: AthenaExportEntry[]) {
  const safeTitle = escapeHtml(title);
  const generatedAt = escapeHtml(new Date().toLocaleString());
  const messages = entries.map((entry) => `
    <article class="message ${entry.sender}">
      <header>
        <strong>${entry.sender === "user" ? "USER" : "ATHENA"}</strong>
        <time>${escapeHtml(new Date(entry.timestamp).toLocaleString())}</time>
      </header>
      <div class="content">${entry.html}</div>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; color: #172033; background: #f7f9fc; }
    body { max-width: 900px; margin: 0 auto; padding: 40px; }
    .savant-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 30px; padding: 0 0 16px; border-bottom: 2px solid #00a7b5; }
    .savant-wordmark { color: #008c99; font: 800 13px/1 "SFMono-Regular", Consolas, monospace; letter-spacing: .24em; }
    .savant-product { margin-top: 7px; color: #6957d9; font: 700 10px/1 "SFMono-Regular", Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; }
    .document-title { max-width: 620px; text-align: right; font-size: 22px; font-weight: 750; line-height: 1.2; color: #172033; }
    .savant-footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 34px; padding-top: 12px; border-top: 1px solid #cbd5e1; color: #64748b; font: 10px/1.4 "SFMono-Regular", Consolas, monospace; letter-spacing: .05em; }
    .message { width: min(82%, 720px); margin-bottom: 20px; padding: 18px; border: 1px solid #d8e0ec; border-radius: 10px; background: #fff; break-inside: avoid; }
    .message.user { margin-left: auto; margin-right: 0; border-right: 4px solid #00a7b5; text-align: right; }
    .message.assistant { margin-left: 0; margin-right: auto; border-left: 4px solid #6957d9; text-align: left; }
    .message.user header { flex-direction: row-reverse; }
    header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; color: #556176; font-size: 11px; letter-spacing: .08em; }
    .content { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
    .content > :first-child { margin-top: 0; }
    .content > :last-child { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef3f8; }
    pre { overflow-x: auto; padding: 12px; background: #101827; color: #e5edf7; border-radius: 6px; white-space: pre-wrap; }
    code { font-family: "SFMono-Regular", Consolas, monospace; }
    blockquote { margin-left: 0; padding-left: 14px; border-left: 3px solid #94a3b8; color: #475569; }
    .mermaid { margin: 16px 0; overflow-x: auto; text-align: center; break-inside: avoid; }
    .mermaid svg { display: inline-block; max-width: 100%; height: auto; }
    @page { size: A4; margin: 14mm; }
    @media print { body { padding: 0; } .savant-footer { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="savant-header">
    <div><div class="savant-wordmark">SAVANT</div><div class="savant-product">Olympus · Athena export</div></div>
    <div class="document-title">${safeTitle}</div>
  </div>
  ${messages}
  <footer class="savant-footer"><span>SAVANT OLYMPUS · ATHENA</span><span>Generated ${generatedAt}</span></footer>
</body>
</html>`;
}

export function downloadHtmlDocument(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument;
  if (!frameDocument || !frame.contentWindow) {
    frame.remove();
    throw new Error("Unable to open the PDF print view.");
  }
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
}
