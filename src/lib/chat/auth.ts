import { createClient } from "@/lib/supabase/server";

export async function resolveChatUser(): Promise<{
  userId: string;
  isAuthenticated: boolean;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { userId: "default", isAuthenticated: true };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: "", isAuthenticated: false };
  }

  return { userId: user.id, isAuthenticated: true };
}
