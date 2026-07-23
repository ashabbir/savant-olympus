import React from "react";
import { FileCode2, FileText } from "lucide-react";
import { AthenaMessageModel } from "@/components/shared/AthenaMessage";
import { buildAthenaExportDocument, downloadHtmlDocument, printHtmlDocument } from "@/components/tabs/knowledge/utils/chatExport";

type ExportFormat = "html" | "pdf";

async function exportMessages(format: ExportFormat, messages: AthenaMessageModel[], indexes: number[], title: string, scope: string) {
  const entries = messages.map((message, position) => {
    const content = document.querySelector<HTMLElement>(`[data-athena-export-scope="${scope}"][data-athena-message-index="${indexes[position]}"] [data-athena-export-content]`);
    if (!content) throw new Error("ATHENA message content is not available for export.");
    return { sender: message.sender, timestamp: message.timestamp || new Date().toISOString(), html: content.innerHTML };
  });
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "athena-chat";
  const html = buildAthenaExportDocument(title, entries);
  const request = { format, html, defaultFilename: `${filename}.${format}` };
  try {
    await window.system.exportDocument(request);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (!detail.includes("No handler registered for 'export-document'")) throw error;
    format === "html" ? downloadHtmlDocument(html, request.defaultFilename) : printHtmlDocument(html);
  }
}

function ExportButton({ format, onClick, compact = false }: { format: ExportFormat; onClick: () => void; compact?: boolean }) {
  const Icon = format === "html" ? FileCode2 : FileText;
  return <button type="button" onClick={onClick} title={`Download as ${format.toUpperCase()}`} aria-label={`Download as ${format.toUpperCase()}`} className={`${compact ? "p-1" : "p-1.5"} rounded border border-[var(--cp-border)] bg-[var(--cp-bg-2)] text-muted-foreground hover:text-[var(--cp-cyan)]`}><Icon size={compact ? 9 : 12} /></button>;
}

export function AthenaMessageExportActions({ message, index, title, scope }: { message: AthenaMessageModel; index: number; title: string; scope: string }) {
  const run = (format: ExportFormat) => void exportMessages(format, [message], [index], `${title} - ${message.sender === "user" ? "User" : "ATHENA"} message`, scope).catch(error => alert(error instanceof Error ? error.message : "Export failed."));
  return <><ExportButton compact format="html" onClick={() => run("html")} /><ExportButton compact format="pdf" onClick={() => run("pdf")} /></>;
}

export function AthenaConversationExport({ messages, title, scope }: { messages: AthenaMessageModel[]; title: string; scope: string }) {
  if (!messages.length) return null;
  const run = (format: ExportFormat) => void exportMessages(format, messages, messages.map((_, index) => index), `${title} - ATHENA conversation`, scope).catch(error => alert(error instanceof Error ? error.message : "Export failed."));
  return <div className="shrink-0 border-b border-[var(--cp-border)] bg-[var(--cp-bg-2)] px-3 py-2 flex items-center justify-between gap-2"><span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Export conversation</span><div className="flex gap-1"><ExportButton format="html" onClick={() => run("html")} /><ExportButton format="pdf" onClick={() => run("pdf")} /></div></div>;
}
