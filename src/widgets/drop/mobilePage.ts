// The page a phone sees after scanning the QR code. Self-contained (no external requests).

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const formatSize = (bytes: number): string =>
  bytes < 1024 ** 2 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export function mobilePage(files: Array<{ id: string; name: string; size: number }>): string {
  const rows = files
    .map(
      (f) => `
      <a class="file" href="f/${encodeURIComponent(f.id)}" download>
        <span class="name">${escapeHtml(f.name)}</span>
        <span class="size">${formatSize(f.size)}</span>
      </a>`
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Pulse Drop</title>
<style>
  :root { --bg:#f4f4f5; --card:#fff; --text:#111; --muted:#71717a; --line:#e4e4e7; --accent:#111; --on-accent:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0a0a; --card:#171717; --text:#f4f4f5; --muted:#a1a1aa; --line:#262626; --accent:#f4f4f5; --on-accent:#111; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px 16px 40px; background:var(--bg); color:var(--text); font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
  h1 { font-size:22px; margin:4px 0 2px; }
  p.sub { margin:0 0 18px; color:var(--muted); font-size:14px; }
  section { background:var(--card); border-radius:16px; padding:6px; margin-bottom:14px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:10px 10px 6px; }
  .file { display:flex; justify-content:space-between; gap:12px; padding:12px 10px; border-radius:10px; color:inherit; text-decoration:none; }
  .file + .file { border-top:1px solid var(--line); }
  .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .size, .empty { color:var(--muted); font-size:14px; flex:none; }
  .empty { padding:12px 10px; }
  .btn { display:block; width:100%; padding:14px; border:0; border-radius:12px; background:var(--accent); color:var(--on-accent); font:inherit; font-weight:600; text-align:center; }
  .actions { padding:6px; }
  #status { padding:4px 10px 10px; color:var(--muted); font-size:14px; }
  .ok { color:#16a34a; }
</style>
</head>
<body>
  <h1>Pulse Drop</h1>
  <p class="sub">Straight from your PC over this Wi-Fi. Nothing is uploaded to the internet.</p>

  <section>
    <h2>From your PC</h2>
    ${rows || '<div class="empty">No files shared. You can still send files to the PC below.</div>'}
  </section>

  <section>
    <h2>Send to your PC</h2>
    <div class="actions">
      <input id="pick" type="file" multiple hidden>
      <button class="btn" onclick="document.getElementById('pick').click()">Choose files</button>
    </div>
    <div id="status"></div>
  </section>

<script>
  const status = document.getElementById('status')
  document.getElementById('pick').addEventListener('change', async (e) => {
    const files = [...e.target.files]
    let done = 0
    for (const file of files) {
      status.textContent = 'Sending ' + file.name + ' (' + (done + 1) + ' of ' + files.length + ')…'
      try {
        const res = await fetch('upload?name=' + encodeURIComponent(file.name), { method: 'PUT', body: file })
        if (!res.ok) throw new Error(res.status)
        done++
      } catch (err) {
        status.textContent = 'Could not send ' + file.name + '. Is the drop still open on your PC?'
        return
      }
    }
    status.innerHTML = '<span class="ok">Received ✓</span> ' + done + ' file' + (done === 1 ? '' : 's') + ' saved to your PC.'
    e.target.value = ''
  })
</script>
</body>
</html>`
}
