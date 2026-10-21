// Shared HTML helpers for the branded transactional emails (welcome).

// Minimal HTML escape so user-supplied text echoed back into an email (a submitter's name or
// message) can't inject markup. Escapes the five characters that matter inside element content
// and double-quoted attributes.
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
