"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  SupportedTimezone,
  TimezoneCode,
  TimezoneConfig,
  TIMEZONE_CONFIGS,
  getTimezoneConfig,
  formatInTimezone,
  formatTimeWithZone,
  formatDateWithZone,
  convertETTimeStringToZone
} from "../lib/market/timezone";

interface TimezoneContextType {
  timezone: SupportedTimezone;
  timezoneCode: TimezoneCode;
  config: TimezoneConfig;
  setTimezone: (tz: SupportedTimezone) => void;
  formatTime: (date: Date | string | number, includeSeconds?: boolean) => string;
  formatDate: (date: Date | string | number) => string;
  convertETTime: (timeET: string, referenceDateStr?: string) => string;
}

const TimezoneContext = createContext<TimezoneContextType | null>(null);

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezoneState] = useState<SupportedTimezone>("America/New_York");

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("minbook_timezone") || localStorage.getItem("openpulse_timezone");
      if (
        stored &&
        (stored === "America/New_York" ||
          stored === "America/Chicago" ||
          stored === "America/Los_Angeles")
      ) {
        setTimezoneState(stored as SupportedTimezone);
      }
    } catch {
      // ignore
    }
  }, []);

  const setTimezone = (tz: SupportedTimezone) => {
    setTimezoneState(tz);
    try {
      localStorage.setItem("minbook_timezone", tz);
    } catch {
      // ignore
    }
  };

  const config = useMemo(() => getTimezoneConfig(timezone), [timezone]);

  const value: TimezoneContextType = useMemo(
    () => ({
      timezone,
      timezoneCode: config.code,
      config,
      setTimezone,
      formatTime: (date, includeSeconds = true) =>
        formatTimeWithZone(date, timezone, includeSeconds),
      formatDate: (date) => formatDateWithZone(date, timezone),
      convertETTime: (timeET, referenceDateStr) =>
        convertETTimeStringToZone(timeET, timezone, referenceDateStr)
    }),
    [timezone, config]
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone(): TimezoneContextType {
  const ctx = useContext(TimezoneContext);
  if (!ctx) {
    const cfg = getTimezoneConfig("America/New_York");
    return {
      timezone: "America/New_York",
      timezoneCode: "ET",
      config: cfg,
      setTimezone: () => {},
      formatTime: (d, s = true) => formatTimeWithZone(d, "America/New_York", s),
      formatDate: (d) => formatDateWithZone(d, "America/New_York"),
      convertETTime: (t, r) => convertETTimeStringToZone(t, "America/New_York", r)
    };
  }
  return ctx;
}
