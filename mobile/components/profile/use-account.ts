// The signed-in user's email, whether it's an email/password account, and whether it signs in with
// Apple. Apple-ID sign-ins have no email/password to change (Apple owns both), so Password and Email
// are shown only for email/password accounts; deleting an Apple account also revokes the Apple link.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/auth/supabase";

export function useAccount(): { email: string | null; isPasswordAccount: boolean; isAppleAccount: boolean } {
  const [email, setEmail] = useState<string | null>(null);
  const [isPasswordAccount, setIsPasswordAccount] = useState(false);
  const [isAppleAccount, setIsAppleAccount] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? null);
      const hasEmailIdentity = user?.identities?.some((i) => i.provider === "email");
      setIsPasswordAccount(hasEmailIdentity ?? user?.app_metadata?.provider === "email");
      setIsAppleAccount(user?.identities?.some((i) => i.provider === "apple") ?? false);
    });
  }, []);

  return { email, isPasswordAccount, isAppleAccount };
}
