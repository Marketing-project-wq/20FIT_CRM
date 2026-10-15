/**
 * Agent Mail — the text an AI agent reads (MCP `initialize.instructions` + the `agent_mail_guide`
 * tool) and the prompt template a human copies from the Agent Mail tab. One file so the UI and the
 * server can never describe two different workflows. Plain module (no server-only): the client tab
 * imports the prompt template + MCP name from here.
 */

/** Every template an agent creates starts with this key prefix — that is how the Kampanye list and
 *  list_campaigns tell an Agent Mail campaign apart from a manual or workflow one. */
export const AGENT_TEMPLATE_PREFIX = "agent-mail-";

export function isAgentMailTemplateKey(templateKey: string): boolean {
  return templateKey.startsWith(AGENT_TEMPLATE_PREFIX);
}

/** The name the MCP server is registered under in Claude Code (`claude mcp add … <name>`). */
export const AGENT_MCP_NAME = "agent-mail-20fit";

export const AGENT_MAIL_GUIDE = `Agent Mail 20FIT — kamu menjalankan blast email lewat CRM 20FIT (crm.20fit.id) atas nama user pemilik token.

ALUR KERJA (urutkan persis):
1. Audiens
   - Sudah ada di CRM → list_segments, pilih segment_id.
   - Dari file CSV/Excel user → ubah Excel ke CSV dulu, lalu import_audience dengan dry_run: true, laporkan ringkasannya, lalu import_audience lagi tanpa dry_run. Wajib isi consent_source (asal kontak + bagaimana mereka setuju) dan consent_confirmed: true. Hasilnya segment_id baru.
2. Email → create_email(name, subject, html, sender_name?, preheader?). Pakai HTML dari user apa adanya; jangan ubah isi/penawaran tanpa diminta. Hasilnya template_key.
3. Cek → send_test_email ke alamat penguji yang diberikan user (kalau ada), lalu preview_campaign(segment_id, template_key) dan catat 'sendable'.
4. Kirim → send_campaign(name, segment_id, template_key, expected_recipients = sendable). Penerima > 500 butuh confirm_large_send: true. Jadwal: schedule_wib 'YYYY-MM-DD HH:MM'.
5. Laporan → campaign_stats(run_id). Open/klik masuk bertahap beberapa jam setelah kirim.

ATURAN EMAIL:
- Variabel bawaan: {{first_name}}, {{full_name}}, {{city}}, {{unsubscribe_url}}. Kolom lain dari CSV bisa dipakai sebagai {{nama_kolom}} — kirim CSV yang sama sebagai merge_csv di send_campaign.
- Link berhenti langganan WAJIB; create_email menambahkannya otomatis kalau tidak ada.
- Gambar harus URL https publik (jangan base64 / file lokal). Lebar konten 600px, inline CSS.
- Subjek jujur dan sesuai isi; jangan pakai huruf kapital semua atau tanda seru berlebihan.

ATURAN AMAN:
- Orang yang unsubscribe, bounce, atau lapor spam otomatis tidak dikirimi — jangan mencoba mengakalinya.
- Jangan kirim campaign yang sama dua kali. Kalau server menolak dengan send_in_progress, campaign itu masih berjalan.
- Kalau count_changed: pakai fresh_sendable yang baru, jelaskan ke user, lalu kirim ulang.
- Selalu laporkan ke user: nama campaign, segmen, jumlah penerima, run_id, dan link CRM.`;

/** The prompt a human pastes into Claude Code (fill the [brackets]). Mirrors the 4 inputs: brief,
 *  audience file (optional), this MCP server, the HTML email. */
export const AGENT_MAIL_PROMPT_TEMPLATE = `Pakai MCP "${AGENT_MCP_NAME}" untuk menjalankan blast email 20FIT. Baca agent_mail_guide dulu.

Tujuan campaign: [mis. promo early bird HYROX Jakarta, diskon 20% sampai 31 Oktober]
Nama campaign: [mis. HYROX Jakarta — Early Bird Okt 2026]

Audiens (pilih satu):
- Segmen CRM: [nama segmen, mis. "Peserta HYROX 2025"]
- ATAU file: [path ke .csv / .xlsx, mis. ~/Downloads/peserta-hyrox.xlsx]
  Sumber & persetujuan kontak: [mis. form pendaftaran HYROX 2025, centang setuju info promo]

Email HTML: [path ke file .html, mis. ~/Downloads/email-hyrox.html]
Subjek: [mis. {{first_name}}, early bird HYROX Jakarta tinggal 7 hari]
Nama pengirim: [mis. 20FIT]
Kirim test dulu ke: [email kamu]
Waktu kirim: [sekarang / 2026-10-20 09:00 WIB]

Setelah terkirim, laporkan run_id, jumlah penerima, dan link CRM-nya. Besok cek performanya dengan campaign_stats.`;

/** The MCP install command for a token (shown on the Agent Mail tab and inside the ready prompt). */
export function agentMailInstallCommand(token: string, mcpUrl: string): string {
  return `claude mcp add --transport http ${AGENT_MCP_NAME} ${mcpUrl} --header "Authorization: Bearer ${token}"`;
}

/** The token-in-URL MCP address (app/api/mcp/[token]) — what a claude.ai custom connector takes. */
export function agentMailConnectorUrl(token: string, mcpUrl: string): string {
  return `${mcpUrl}/${token}`;
}

/**
 * The prompt with the token BAKED IN (owner request 2026-10-14): once a token is issued, the copied
 * prompt is self-contained — any Claude Code can install the MCP itself, or, if the tools don't show up
 * in that session yet (MCP servers load at session start), call the same server over plain HTTP.
 */
export function agentMailPromptWithToken(token: string, mcpUrl: string): string {
  return `${AGENT_MAIL_PROMPT_TEMPLATE}

---
AKSES (rahasia — jangan tampilkan ulang token ini, jangan simpan ke file proyek atau commit):
1. Kalau tool MCP "${AGENT_MCP_NAME}" belum ada di sesi ini, pasang dengan menjalankan di terminal:
   ${agentMailInstallCommand(token, mcpUrl)}
   (scope user: tambahkan -s user). Tool baru muncul di sesi Claude Code berikutnya.
2. Kalau tool-nya belum muncul di sesi ini, panggil server yang sama lewat HTTP (JSON-RPC MCP), satu tool per request:
   curl -s ${mcpUrl} -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_mail_guide","arguments":{}}}'
   Ganti "name" dan "arguments" sesuai tool (list_segments, import_audience, create_email, preview_campaign,
   send_test_email, send_campaign, campaign_stats, list_campaigns, stop_campaign). Daftar lengkap + skema
   argumen: method "tools/list". Untuk HTML/CSV besar, tulis body JSON ke file lalu pakai -d @file.json.
3. Kalau ini sesi Claude Code CLOUD (claude.ai/code) dan curl ke crm.20fit.id ditolak proxy (403 / policy denial):
   itu jaringan sesi cloud, bukan CRM. Jangan bypass proxy. Minta user menambahkan connector di
   claude.ai → Settings → Connectors → Add custom connector, URL (tanpa OAuth):
   ${agentMailConnectorUrl(token, mcpUrl)}
   lalu mengaktifkan connector itu di sesi ini — tool-nya lewat server Anthropic, tidak kena blokir proxy.`;
}
