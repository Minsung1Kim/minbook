"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured. Running in local zero-config mode.");
        setLoading(false);
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push(redirectPath);
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div className="inline-flex items-center space-x-2 mb-2">
          <span className="font-bold text-xl tracking-tight text-zinc-100">
            TapeBook
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold">
            NQ / MNQ
          </span>
        </div>
        <h1 className="text-sm font-medium text-zinc-300 tracking-tight">
          Sign In to Your Account
        </h1>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
          Shared team access. Sign in with your account credentials.
        </p>
      </div>

      <div className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-6 shadow-xl backdrop-blur-sm">
        {error && (
          <div className="mb-4 p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors font-sans"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
          >
            <span>{loading ? "Signing In..." : "Sign In"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span className="flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>RLS Secured</span>
          </span>
          <span>Invite Only</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center px-4 py-12 font-sans selection:bg-zinc-800 selection:text-white">
      <Suspense
        fallback={
          <div className="text-xs font-mono text-zinc-500 animate-pulse">
            Loading login...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
