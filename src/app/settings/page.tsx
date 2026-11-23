"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import {
  Settings,
  Shield,
  Target,
  User,
  Users,
  Database,
  Key,
  Check,
  Save,
  AlertTriangle,
  Info,
  DollarSign
} from "lucide-react";
import { UserProfile } from "@/types/app";

export default function SettingsPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("minsung");
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [defaultInstrument, setDefaultInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [riskBudget, setRiskBudget] = useState(250);
  const [targetBudget, setTargetBudget] = useState(550);
  const [maxDailyLoss, setMaxDailyLoss] = useState(350);
  const [trailingDrawdownAlert, setTrailingDrawdownAlert] = useState(2000);
  const [notes, setNotes] = useState("");

  // New Profile Modal / state
  const [newProfileName, setNewProfileName] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.profiles?.length > 0) {
          setProfiles(res.profiles);
          selectProfile(res.profiles[0]);
        }
      });
  };

  const selectProfile = (p: UserProfile) => {
    setActiveProfileId(p.id);
    setCurrentProfile(p);
    setName(p.name);
    setDefaultInstrument(p.defaultInstrument);
    setRiskBudget(p.riskBudgetDollars);
    setTargetBudget(p.targetBudgetDollars);
    setMaxDailyLoss(p.maxDailyLossDollars);
    setTrailingDrawdownAlert(p.trailingDrawdownAlert);
    setNotes(p.notes || "");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeProfileId,
          name,
          defaultInstrument,
          riskBudgetDollars: Number(riskBudget),
          targetBudgetDollars: Number(targetBudget),
          maxDailyTrades: 1,
          maxDailyLossDollars: Number(maxDailyLoss),
          trailingDrawdownAlert: Number(trailingDrawdownAlert),
          notes
        })
      });

      const json = await res.json();
      if (json.success) {
        setSavedNotice("Profile guardrails saved successfully!");
        setProfiles(json.profiles);
        setTimeout(() => setSavedNotice(null), 2500);
      }
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  const handleCreateFriendProfile = async () => {
    if (!newProfileName.trim()) return;
    const friendId = newProfileName.toLowerCase().replace(/[^a-z0-9]/g, "-");

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: friendId,
          name: newProfileName,
          defaultInstrument: "MNQ",
          riskBudgetDollars: 200,
          targetBudgetDollars: 500,
          maxDailyTrades: 1,
          maxDailyLossDollars: 250,
          trailingDrawdownAlert: 1500,
          notes: "Friend trading profile"
        })
      });

      const json = await res.json();
      if (json.success) {
        setProfiles(json.profiles);
        setNewProfileName("");
        setShowAddFriend(false);
        selectProfile(json.profile);
      }
    } catch (err) {
      console.error("Create profile error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header selectedInstrument={defaultInstrument} onSelectInstrument={(i) => setDefaultInstrument(i)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-cyan-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                Trader Settings & Risk Guardrails
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Configure personal and friend risk budgets, instrument sizing defaults, prop drawdown rules, and market data API keys.
            </p>
          </div>

          {savedNotice && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-mono text-xs flex items-center space-x-1.5 animate-pulse">
              <Check className="w-4 h-4" />
              <span>{savedNotice}</span>
            </div>
          )}
        </div>

        {/* Profile Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs font-mono">
          <span className="text-slate-400 flex items-center space-x-1 mr-2">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Profile:</span>
          </span>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProfile(p)}
              className={`px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
                activeProfileId === p.id
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
              }`}
            >
              {p.name}
            </button>
          ))}

          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-xs"
          >
            + Add Friend Profile
          </button>
        </div>

        {/* Add Friend Form */}
        {showAddFriend && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center space-x-3 text-xs font-mono">
            <span className="text-slate-300 font-semibold">Friend's Name:</span>
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="e.g. David (TopStep 100k)"
              className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white flex-1 max-w-xs"
            />
            <button
              onClick={handleCreateFriendProfile}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold"
            >
              Create Profile
            </button>
            <button
              onClick={() => setShowAddFriend(false)}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Main Settings Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start font-mono text-xs">
          {/* Column 1 & 2: Risk Guardrails Form */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-2 p-6 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-sm font-bold text-white flex items-center space-x-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Risk & Sizing Budget ({name})</span>
              </span>
              <span className="text-slate-400 text-[11px]">1 Trade / Day Rule</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1">Profile Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Preferred Instrument</label>
                <select
                  value={defaultInstrument}
                  onChange={(e) => setDefaultInstrument(e.target.value as "NQ" | "MNQ")}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white font-bold"
                >
                  <option value="NQ">NQ (E-mini Nasdaq 100 - $20/pt)</option>
                  <option value="MNQ">MNQ (Micro E-mini - $2/pt Precision)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1 flex items-center justify-between">
                  <span>Risk Budget ($200–$300)</span>
                  <strong className="text-rose-400 text-sm">${riskBudget}</strong>
                </label>
                <input
                  type="number"
                  min="150"
                  max="400"
                  step="25"
                  value={riskBudget}
                  onChange={(e) => setRiskBudget(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Allows {(riskBudget / 20).toFixed(1)} pts on 1 NQ or {(riskBudget / 8).toFixed(1)} pts on 4 MNQ
                </span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 flex items-center justify-between">
                  <span>Profit Target ($500–$600)</span>
                  <strong className="text-emerald-400 text-sm">${targetBudget}</strong>
                </label>
                <input
                  type="number"
                  min="400"
                  max="1000"
                  step="50"
                  value={targetBudget}
                  onChange={(e) => setTargetBudget(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Standard R:R Ratio = {(targetBudget / riskBudget).toFixed(2)}R
                </span>
              </div>
            </div>

            {/* Prop Account Guardrails */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <span className="text-amber-400 font-bold text-xs uppercase tracking-wider block">
                Prop Drawdown & Hard Stop Guardrails:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Max Daily Loss Limit ($)</label>
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-rose-300 font-bold"
                  />
                  <span className="text-[10px] text-slate-500">If reached, trading halts immediately</span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Trailing Drawdown Alert ($)</label>
                  <input
                    type="number"
                    value={trailingDrawdownAlert}
                    onChange={(e) => setTrailingDrawdownAlert(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-cyan-300 font-bold"
                  />
                  <span className="text-[10px] text-slate-500">Distance to prop liquidation threshold</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Strategy & Profile Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200"
                placeholder="Personal trade rules, e.g. Do not enter before 9:34 AM. Wait for retrace to VWAP."
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center space-x-2 transition-all shadow-lg shadow-cyan-500/20"
              >
                <Save className="w-4 h-4" />
                <span>Save Profile Guardrails</span>
              </button>
            </div>
          </form>

          {/* Column 3: Market Data Provider Status & API Config Info */}
          <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Database className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white tracking-tight">
                Market Data Provider Config
              </h2>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white">Active Engine:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Yahoo Finance (Free)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Connects to CME Globex intraday/daily feeds with automated rate-limit caching.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white">Polygon.io Adapter:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    Pluggable (.env)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  To enable real-time Polygon prints, add your key to <code className="text-cyan-300">.env.local</code>:
                </p>
                <div className="p-2 rounded bg-black/60 border border-slate-800 text-[10px] text-slate-300 select-all">
                  POLYGON_API_KEY=your_key_here<br />
                  MARKET_DATA_PROVIDER=polygon
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-300 font-semibold block text-xs">
                  Staleness Indicators:
                </span>
                <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                  <li><span className="text-emerald-400 font-bold">LIVE:</span> Print under 120s old</li>
                  <li><span className="text-amber-400 font-bold">DELAYED:</span> 15-min exchange standard</li>
                  <li><span className="text-cyan-400 font-bold">DERIVED:</span> Synthetic level/VWAP/ATR</li>
                  <li><span className="text-purple-400 font-bold">SAMPLE:</span> Offline fallback mode</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
