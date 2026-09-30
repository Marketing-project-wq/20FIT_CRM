import "server-only";
import juice from "juice";

/**
 * Inline `<style>` block CSS into element `style` attributes so styles survive in email clients
 * (Gmail, Yahoo, older Outlook) that strip `<head>` content. Media queries and pseudo-selectors
 * are preserved in the `<style>` block for clients that support them (Apple Mail, Outlook 365).
 *
 * This is a server-only step applied AFTER renderEmailDocument and BEFORE sending. The preview
 * in the browser doesn't need this — browsers support `<style>` blocks natively.
 */
export function inlineEmailCss(html: string): string {
  try {
    return juice(html, {
      preserveMediaQueries: true,
      preserveFontFaces: true,
      preserveKeyFrames: true,
      preservePseudos: true,
      applyAttributesTableElements: true,
      removeStyleTags: false,
      preserveImportant: true,
      inlinePseudoElements: false,
    });
  } catch {
    return html;
  }
}
