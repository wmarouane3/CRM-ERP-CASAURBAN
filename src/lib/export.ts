/**
 * SHOES OS — export helpers.
 * CSV is generated with a UTF-8 BOM so Excel opens Arabic correctly, and
 * with `sep=,` so French/Moroccan Excel locales don't merge columns.
 */

export function toCsv(rows: Record<string, string | number | undefined>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\r\n');
  return `sep=,\r\n${headers.map(esc).join(',')}\r\n${body}`;
}

/**
 * Saves a generated file.
 *
 * Two hosts, one call site:
 *  • a normal deployment (Vercel/Netlify/localhost) → blob + <a download>
 *  • the hosted preview, where the frame may not download directly → the
 *    host's save surface, which asks the viewer to confirm.
 * The hosted path is tried first when present and falls back silently.
 */
interface HostSave {
  use?(name: 'downloads'): Promise<{ save(r: { filename: string; data: string }): Promise<unknown> } | null>;
}

function saveViaAnchor(filename: string, content: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function download(
  filename: string, content: string, mime = 'text/csv;charset=utf-8',
) {
  const host = (globalThis as { claude?: HostSave }).claude;
  if (host?.use) {
    try {
      const downloads = await host.use('downloads');
      if (downloads) {
        const data = '﻿' + content;
        try {
          await downloads.save({ filename, data });
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (code === 'declined' || code === 'rate_limited') return;
          if (code === 'rejected_extension' || code === 'extension_not_enabled') {
            await downloads.save({ filename: filename.replace(/\.[^.]+$/, '.txt'), data });
            return;
          }
          saveViaAnchor(filename, content, mime);
        }
        return;
      }
    } catch { /* fall through to the plain anchor */ }
  }
  saveViaAnchor(filename, content, mime);
}

/** Opens the browser print dialog scoped to one element — the PDF path. */
export function printElement(elementId: string, title: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) return;
  win.document.write(`<!doctype html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8"><title>${title}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap">
    <style>
      body{font-family:'IBM Plex Sans Arabic',sans-serif;padding:28px;color:#101828}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #e4e7ec;padding:6px 8px;text-align:right}
      th{background:#f5f6f9;font-size:11px;text-transform:uppercase}
      h1{font-size:18px;margin:0 0 4px} .muted{color:#667085;font-size:12px;margin-bottom:18px}
      @media print { .no-print { display:none } }
    </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
