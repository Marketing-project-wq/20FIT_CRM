import "server-only";

/**
 * WhatsApp Business API connection STATUS (contacting-half TUGAS 4). The product owner said 20FIT
 * has a WhatsApp Business account and to "prepare the settings surface; the credentials come later."
 *
 * Credentials are stored like every other secret in this system — as environment variables set in
 * Railway (same as MAILTRAP_API_TOKEN), NEVER in a table and NEVER shown back once set. This module
 * therefore reports only PRESENCE (configured / not), never a value. Today all three are absent, so
 * the surface honestly says "not connected" instead of looking ready.
 *
 * Env vars (to be set in Railway when the account is wired):
 *   WHATSAPP_ACCESS_TOKEN        — the API access token (secret)
 *   WHATSAPP_PHONE_NUMBER_ID     — the sender phone-number id
 *   WHATSAPP_BUSINESS_ACCOUNT_ID — the WhatsApp Business Account id
 */

export interface WhatsappConfigStatus {
  accessToken: boolean;
  phoneNumberId: boolean;
  businessAccountId: boolean;
  /** True only when ALL three are present — a partial config is not "connected". */
  connected: boolean;
}

function present(v: string | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function whatsappConfigStatus(): WhatsappConfigStatus {
  const accessToken = present(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = present(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId = present(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    connected: accessToken && phoneNumberId && businessAccountId,
  };
}
