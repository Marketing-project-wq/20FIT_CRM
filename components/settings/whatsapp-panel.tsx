import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getServerDict } from "@/lib/i18n/server";
import { whatsappConfigStatus } from "@/lib/messaging/whatsapp-config";

/**
 * WhatsApp Business API connection status (contacting-half TUGAS 4). Server component: reads the
 * PRESENCE of the credential env vars and reports it — never a value. Today all absent → the panel
 * honestly reads "Not connected" instead of looking ready. It is a status surface, not a form:
 * credentials are set in Railway like every other secret.
 */
export function WhatsappPanel() {
  const { t } = getServerDict();
  const s = whatsappConfigStatus();

  const fields: { label: string; on: boolean }[] = [
    { label: t.messaging.waFieldToken, on: s.accessToken },
    { label: t.messaging.waFieldPhone, on: s.phoneNumberId },
    { label: t.messaging.waFieldAccount, on: s.businessAccountId },
  ];

  return (
    <section className="glass shadow-glass p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-ink-soft" aria-hidden />
          <h2 className="font-display text-[18px] font-extrabold uppercase tracking-wide text-ink">
            {t.messaging.waTitle}
          </h2>
        </div>
        <Badge tone={s.connected ? "green" : "neutral"}>
          {s.connected ? t.messaging.waConnected : t.messaging.waNotConnected}
        </Badge>
      </div>
      <p className="mt-1.5 max-w-3xl font-body text-[13px] leading-relaxed text-ink-soft">
        {t.messaging.waSubtitle}
      </p>

      <dl className="mt-5 space-y-2.5">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center justify-between border-t border-glass-border pt-2.5 first:border-t-0 first:pt-0">
            <dt className="font-body text-[13px] text-ink">{f.label}</dt>
            <dd className="font-mono text-[12px] text-ink-faint">
              {f.on ? t.messaging.waConfigured : t.messaging.waNotSet}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 font-body text-[12px] leading-relaxed text-ink-faint">{t.messaging.waNote}</p>
    </section>
  );
}
