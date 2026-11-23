"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { UserProfile } from "@/types/app";
import {
  Settings,
  Shield,
  Save,
  Check,
  Database,
  Users,
  Plus
} from "lucide-react";

export function SettingsPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("minsung");
  const [loading, setLoading] = useState<boolean>(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Active profile form state
  const [name, setName] = useState<string>("");
  const [riskBudget, setRiskBudget] = useState<number>(250);
  const [targetBudget, setTargetBudget] = useState<number>(550);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(600);
  const [trailingDrawdownAlert, setTrailingDrawdownAlert] = useState<number>(1000);
  const [defaultInstrument, setDefaultInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [notes, setNotes] = useState<string>("");

  // New Friend Profile Form
  const [showAddFriend, setShowAddFriend] = useState<boolean>(false);
  const [friendName, setFriendName] = useState<string>("");
  const [friendRisk, setFriendRisk] = useState<number>(250);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const json = await res.json();
      if (json.success && json.data) {
        setProfiles(json.data.profiles);
        const active = json.data.profiles.find((p: UserProfile) => p.id === activeProfileId) || json.data.profiles[0];
        if (active) {
          setName(active.name);
          setRiskBudget(active.riskBudgetDollars);
          setTargetBudget(active.targetBudgetDollars);
          setMaxDailyLoss(active.maxDailyLossDollars);
          setTrailingDrawdownAlert(active.trailingDrawdownAlert);
          setDefaultInstrument(active.defaultInstrument);
          setNotes(active.notes || "");
          setActiveProfileId(active.id);
        }
      }
    } catch (err) {
      console.error("fetchSettings error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const selectProfile = (p: UserProfile) => {
    setActiveProfileId(p.id);
    setName(p.name);
    setRiskBudget(p.riskBudgetDollars);
    setTargetBudget(p.targetBudgetDollars);
    setMaxDailyLoss(p.maxDailyLossDollars);
    setTrailingDrawdownAlert(p.trailingDrawdownAlert);
    setDefaultInstrument(p.defaultInstrument);
    setNotes(p.notes || "");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      id: activeProfileId,
      name,
      riskBudgetDollars: riskBudget,
      targetBudgetDollars: targetBudget,
      maxDailyLossDollars: maxDailyLoss,
      maxDailyTrades: 1,
      trailingDrawdownAlert,
      defaultInstrument,
      notes,
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: updated })
      });
      const json = await res.json();
      if (json.success) {
        setSavedNotice("Profile guardrails saved");
        setTimeout(() => setSavedNotice(null), 2500);
        fetchSettings();
      }
    } catch (err) {
      console.error("handleSaveProfile error:", err);
    }
  };

  const handleCreateFriendProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendName.trim()) return;

    const newId = friendName.toLowerCase().replace(/\s+/g, "_");
    const newProfile: UserProfile = {
      id: newId,
      name: friendName,
      riskBudgetDollars: friendRisk,
      targetBudgetDollars: Math.round(friendRisk * 2.2),
      maxDailyLossDollars: friendRisk * 2,
      maxDailyTrades: 1,
      trailingDrawdownAlert: 1000,
      defaultInstrument: "NQ",
      notes: "Friend trading profile (1 trade/day)",
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: newProfile })
      });
      const json = await res.json();
      if (json.success) {
        setShowAddFriend(false);
        setFriendName("");
        fetchSettings();
      }
    } catch (err) {
      console.error("handleCreateFriendProfile error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header selectedInstrument={defaultInstrument} onSelectInstrument={(i) => setDefaultInstrument(i)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg bg-[#0f1624] border border-slate-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <Settings className="w-4 h-4 text-slate-400" />
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Trader Settings & Risk Guardrails
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure personal and friend risk budgets, instrument sizing defaults, prop drawdown rules, and data feed adapters.
            </p>
          </div>

          {savedNotice && (
            <div className="px-3 py-1 rounded bg-slate-800 border border-emerald-800 text-emerald-400 text-xs flex items-center space-x-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{savedNotice}</span>
            </div>
          )}
        </div>

        {/* Profile Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3 text-xs">
          <span className="text-slate-400 flex items-center space-x-1 mr-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>Profile:</span>
          </span>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProfile(p)}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeProfileId === p.id
                  ? "bg-slate-800 text-white border border-slate-700"
                  : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {p.name}
            </button>
          ))}

          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors text-xs flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Friend Profile</span>
          </button>
        </div>

        {/* Add Friend Profile Inline Form */}
        {showAddFriend && (
          <div className="p-4 rounded-lg bg-[#0f1624] border border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Friend Name</label>
              <input
                type="text"
                placeholder="e.g. Alex"
                value={friendName}
                onChange={(e) => setFriendName(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Dollar Risk Budget</label>
              <input
                type="number"
                value={friendRisk}
                onChange={(e) => setFriendRisk(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white w-24 font-mono tabular-nums"
              />
            </div>
            <button
              onClick={handleCreateFriendProfile}
              className="mt-5 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
            >
              Create Profile
            </button>
            <button
              onClick={() => setShowAddFriend(false)}
              className="mt-5 px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Main Settings Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-xs">
          {/* Column 1 & 2: Risk Guardrails Form */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-2 p-6 rounded-lg bg-[#0f1624] border border-slate-800 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-sm font-semibold text-white flex items-center space-x-2">
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
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Preferred Instrument</label>
                <select
                  value={defaultInstrument}
                  onChange={(e) => setDefaultInstrument(e.target.value as "NQ" | "MNQ")}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-medium"
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
                  <strong className="text-rose-400 font-mono tabular-nums text-sm">${riskBudget}</strong>
                </label>
                <input
                  type="number"
                  min="150"
                  max="400"
                  step="25"
                  value={riskBudget}
                  onChange={(e) => setRiskBudget(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono tabular-nums"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Allows {(riskBudget / 20).toFixed(1)} pts on 1 NQ or {(riskBudget / 8).toFixed(1)} pts on 4 MNQ
                </span>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 flex items-center justify-between">
                  <span>Profit Target ($500–$600)</span>
                  <strong className="text-emerald-400 font-mono tabular-nums text-sm">${targetBudget}</strong>
                </label>
                <input
                  type="number"
                  min="400"
                  max="1000"
                  step="50"
                  value={targetBudget}
                  onChange={(e) => setTargetBudget(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white font-mono tabular-nums"
                  required
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Target Multiple: {(targetBudget / riskBudget).toFixed(2)}R
                </span>
              </div>
            </div>

            {/* Prop Account Guardrails */}
            <div className="p-4 rounded bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-slate-300 font-semibold text-xs block">
                Prop Drawdown & Hard Stop Guardrails
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Max Daily Loss Limit ($)</label>
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-rose-300 font-mono tabular-nums font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">Trading halts if touched</span>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Trailing Drawdown Alert ($)</label>
                  <input
                    type="number"
                    value={trailingDrawdownAlert}
                    onChange={(e) => setTrailingDrawdownAlert(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-cyan-300 font-mono tabular-nums font-semibold"
                  />
                  <span className="text-[11px] text-slate-500">Distance to liquidation limit</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Execution Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200"
                placeholder="Personal rules: Do not enter before 9:34 AM. Wait for retrace to VWAP."
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold flex items-center space-x-2 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Guardrails</span>
              </button>
            </div>
          </form>

          {/* Column 3: Market Data Provider Status & API Config Info */}
          <div className="p-6 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Database className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white tracking-tight">
                Data Feed Architecture
              </h2>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-200">Active Engine:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                    Yahoo Finance (Free)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Connects to CME Globex intraday/daily feeds with automated rate-limit caching.
                </p>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-200">Polygon.io Adapter:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    Pluggable
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  To enable Polygon prints, add your key to <code className="text-cyan-300">.env.local</code>:
                </p>
                <div className="p-2 rounded bg-black/60 border border-slate-800 text-[10px] text-slate-300 select-all font-mono">
                  POLYGON_API_KEY=your_key_here<br />
                  MARKET_DATA_PROVIDER=polygon
                </div>
              </div>

              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                <span className="text-slate-300 font-semibold block text-xs">
                  Staleness Indicators:
                </span>
                <ul className="text-[11px] text-slate-400 space-y-1">
                  <li><span className="text-emerald-400 font-semibold">LIVE:</span> Print under 120s old</li>
                  <li><span className="text-amber-400 font-semibold">DELAYED:</span> 15-min exchange standard</li>
                  <li><span className="text-cyan-400 font-semibold">DERIVED:</span> Calculated VWAP / ATR</li>
                  <li><span className="text-slate-400 font-semibold">SAMPLE:</span> Offline fallback mode</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default SettingsPage;
