"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Lock, ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/journal";

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
      setError(err?.message || "An unexpected error occurred during sign-in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* MinBook Wordmark Header */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center space-x-2 group mb-3">
          <span className="font-semibold text-lg tracking-tight text-zinc-100 group-hover:text-white transition-colors">
            MinBook
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            NQ
          </span>
        </Link>
        <h1 className="text-lg font-medium text-zinc-200 tracking-tight">
          Private Terminal Access
        </h1>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
          Authorized traders only. Sign in to access the empirical AI trade journal and private execution records.
        </p>
      </div>

      {/* Login Card */}
      <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 p-6 shadow-xl backdrop-blur-sm">
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
              Trader Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@minbook.internal"
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors font-sans"
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
              className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-colors font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm"
          >
            <span>{loading ? "Authenticating..." : "Sign In to Terminal"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span className="flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>RLS Enforced</span>
          </span>
          <span>Invite-Only Access</span>
        </div>
      </div>

      {/* Public Access Link */}
      <div className="text-center mt-6">
        <Link
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Return to Public Pre-Market Briefing
        </Link>
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
            Loading terminal login...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
