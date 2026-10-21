import type { RefObject } from "react";
import type { CaptchaHandle } from "../../components/auth/Captcha";

// Small bridge between the auth screens and the <Captcha> widget.
//
// When Turnstile isn't configured (no EXPO_PUBLIC_TURNSTILE_SITEKEY), the widget
// renders nothing and its ref is null — we return undefined so the auth call runs
// without a token. Once the sitekey is set AND Supabase has the matching secret,
// every auth call carries a fresh single-use token and Supabase enforces it.
export async function getCaptchaToken(ref: RefObject<CaptchaHandle | null>): Promise<string | undefined> {
  if (!ref.current) return undefined;
  return ref.current.getToken();
}
