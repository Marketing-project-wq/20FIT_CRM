/** Starter email templates — ready-to-use HTML the team can pick instead of starting from a blank
 *  editor. Each carries {{first_name}} + a spot the unsubscribe link is auto-appended to. Kept plain
 *  and inline-styled so it renders across email clients (no external CSS, no flexbox). */

export interface StarterTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
}

const wrap = (inner: string) =>
  `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
${inner}
      </table>
    </td></tr>
  </table>
</body>
</html>`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Kosong (blank)",
    subject: "",
    html: wrap(`        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;color:#1d1d1f;">Judul Email</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Halo {{first_name}},</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Tulis isi email Anda di sini.</p>
          <p style="margin:24px 0 0;font-size:15px;">Salam,<br>Tim 20FIT</p>
        </td></tr>`),
  },
  {
    id: "newsletter",
    name: "Newsletter",
    subject: "Kabar terbaru dari 20FIT",
    html: wrap(`        <tr><td style="background:#E4002B;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;">20FIT NEWSLETTER</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Halo {{first_name}},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Berikut kabar terbaru dari komunitas 20FIT bulan ini.</p>
          <h2 style="margin:24px 0 8px;font-size:17px;">Sorotan</h2>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Isi sorotan Anda di sini.</p>
          <p style="margin:24px 0 0;font-size:15px;">Salam,<br>Tim 20FIT</p>
        </td></tr>`),
  },
  {
    id: "promo",
    name: "Promo / Penawaran",
    subject: "Penawaran spesial untuk Anda",
    html: wrap(`        <tr><td align="center" style="background:#E4002B;padding:40px 32px;">
          <h1 style="margin:0 0 8px;color:#ffffff;font-size:26px;">PENAWARAN SPESIAL</h1>
          <p style="margin:0;color:#ffffff;font-size:15px;">Khusus untuk Anda, {{first_name}}</p>
        </td></tr>
        <tr><td align="center" style="padding:32px;">
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Jelaskan penawaran Anda di sini.</p>
          <a href="https://20fit.id" style="display:inline-block;background:#E4002B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;">Klaim Sekarang</a>
        </td></tr>`),
  },
  {
    id: "event",
    name: "Undangan Event",
    subject: "Anda diundang: [Nama Event]",
    html: wrap(`        <tr><td align="center" style="padding:40px 32px;background:#1d1d1f;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;">NAMA EVENT</h1>
          <p style="margin:8px 0 0;color:#cccccc;font-size:14px;">Tanggal · Lokasi</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Halo {{first_name}},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Kami mengundang Anda untuk hadir di event kami. Detail acara ada di bawah.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><strong>Kapan:</strong> [tanggal &amp; waktu]<br><strong>Di mana:</strong> [lokasi]</p>
          <a href="https://20fit.id" style="display:inline-block;background:#E4002B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:bold;">Daftar Sekarang</a>
        </td></tr>`),
  },
];
