/**
 * Converts the single-file build into an Artifact-ready page: the Artifact
 * host supplies <!doctype>/<head>/<body>, so we emit only the page content
 * (title, font link, inlined style + module script, and the root node).
 *
 * lastIndexOf is used deliberately: the inlined bundle contains the literal
 * strings "</head>" and "</body>" (the print-to-PDF template), so a regex
 * would stop at the wrong place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(root, '../dist-single/index.html'), 'utf8');

const headStart = src.indexOf('<head>') + '<head>'.length;
const headEnd = src.lastIndexOf('</head>');
const bodyStart = src.indexOf('<body>') + '<body>'.length;
const bodyEnd = src.lastIndexOf('</body>');
if (headEnd < headStart || bodyEnd < bodyStart) throw new Error('unexpected build output');

// drop <title>/<meta charset>/<meta name=…> — the artifact host owns those
const head = src.slice(headStart, headEnd)
  .replace(/<meta[^>]*>/gi, '')
  .replace(/<title>[\s\S]*?<\/title>/gi, '')
  .trim();
const body = src.slice(bodyStart, bodyEnd).trim();

const out = `<title>SHOES OS</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
<style>
  html, body { height: 100%; margin: 0; background: #f5f6f9; color: #101828; }
  body { direction: rtl; }
</style>
<script>
  document.documentElement.setAttribute('lang', 'ar');
  document.documentElement.setAttribute('dir', 'rtl');
</script>
${head}
${body}`;

const dest = path.resolve(root, '../artifact/shoes-os.html');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('wrote', dest, (out.length / 1024).toFixed(0) + ' KB');
