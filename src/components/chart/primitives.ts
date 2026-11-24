import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  SeriesType,
  IChartApiBase,
  ISeriesApi,
  PrimitivePaneViewZOrder,
  Coordinate
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export interface SessionBarTime {
  timeSec: number;
  hourET: number;
  minuteET: number;
}

export interface TimeHighlightSegment {
  type: "GLOBEX" | "NY_OPEN_WINDOW";
  startX: number;
  endX: number;
  label: string;
}

// ---------------------------------------------------------------------------
// 1. VERTICAL TIME HIGHLIGHT PRIMITIVE
// ---------------------------------------------------------------------------
class VerticalTimeHighlightRenderer implements IPrimitivePaneRenderer {
  private _segments: TimeHighlightSegment[] = [];

  setData(segments: TimeHighlightSegment[]) {
    this._segments = segments;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const seg of this._segments) {
        const left = Math.min(seg.startX, seg.endX);
        const right = Math.max(seg.startX, seg.endX);
        const width = Math.max(right - left, 2);

        if (seg.type === "NY_OPEN_WINDOW") {
          // Translucent cyan shading for 09:30–10:00 ET NY Open Retrace Window
          ctx.fillStyle = "rgba(34, 211, 238, 0.08)";
          ctx.fillRect(left, 0, width, mediaSize.height);

          // Hairline vertical borders
          ctx.save();
          ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(left, 0);
          ctx.lineTo(left, mediaSize.height);
          ctx.moveTo(right, 0);
          ctx.lineTo(right, mediaSize.height);
          ctx.stroke();
          ctx.restore();

          // Header Badge at top of chart
          ctx.save();
          ctx.font = "bold 9px monospace";
          const badgeText = seg.label;
          const textMetrics = ctx.measureText(badgeText);
          const badgeW = textMetrics.width + 10;
          const badgeH = 16;
          const badgeX = Math.max(left + 4, 4);

          ctx.fillStyle = "rgba(8, 47, 73, 0.85)";
          ctx.strokeStyle = "rgba(34, 211, 238, 0.6)";
          ctx.lineWidth = 1;
          ctx.fillRect(badgeX, 4, badgeW, badgeH);
          ctx.strokeRect(badgeX, 4, badgeW, badgeH);

          ctx.fillStyle = "#38bdf8";
          ctx.fillText(badgeText, badgeX + 5, 15);
          ctx.restore();
        } else if (seg.type === "GLOBEX") {
          // Subtle slate tint for Globex overnight session (18:00 - 09:30 ET)
          ctx.fillStyle = "rgba(148, 163, 184, 0.03)";
          ctx.fillRect(left, 0, width, mediaSize.height);

          ctx.save();
          ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(left, 0);
          ctx.lineTo(left, mediaSize.height);
          ctx.stroke();
          ctx.restore();

          // Subtle label
          ctx.save();
          ctx.font = "9px monospace";
          ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
          ctx.fillText(seg.label, left + 6, mediaSize.height - 8);
          ctx.restore();
        }
      }
    });
  }
}

export class VerticalTimeHighlightPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _bars: SessionBarTime[] = [];
  private _enabled: boolean = true;
  private _renderer = new VerticalTimeHighlightRenderer();
  private _paneView: IPrimitivePaneView;
  private _views: readonly IPrimitivePaneView[];

  constructor() {
    this._paneView = {
      zOrder: (): PrimitivePaneViewZOrder => "bottom",
      renderer: (): IPrimitivePaneRenderer => this._renderer
    };
    this._views = [this._paneView];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this.updateAllViews();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views;
  }

  setBars(bars: { timestamp: string }[]): void {
    this._bars = bars.map((b) => {
      const dt = new Date(b.timestamp);
      const timeSec = Math.floor(dt.getTime() / 1000);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "numeric",
        hour12: false
      }).formatToParts(dt);
      const hourET = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const minuteET = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
      return { timeSec, hourET, minuteET };
    });
    this.updateAllViews();
    this._requestUpdate?.();
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.updateAllViews();
    this._requestUpdate?.();
  }

  updateAllViews(): void {
    if (!this._chart || !this._enabled || this._bars.length === 0) {
      this._renderer.setData([]);
      return;
    }

    const timeScale = this._chart.timeScale();
    const segments: TimeHighlightSegment[] = [];

    // Identify NY Open Window (09:30–10:00 ET) and Globex (18:00–09:30 ET)
    let currentOpenStart: SessionBarTime | null = null;
    let currentOpenEnd: SessionBarTime | null = null;
    let currentGlobexStart: SessionBarTime | null = null;
    let currentGlobexEnd: SessionBarTime | null = null;

    for (let i = 0; i < this._bars.length; i++) {
      const bar = this._bars[i];
      const isNyOpen = bar.hourET === 9 && bar.minuteET >= 30;
      const isGlobex = bar.hourET >= 18 || bar.hourET < 9 || (bar.hourET === 9 && bar.minuteET < 30);

      // NY Open Window tracking
      if (isNyOpen) {
        if (!currentOpenStart) currentOpenStart = bar;
        currentOpenEnd = bar;
      } else {
        if (currentOpenStart && currentOpenEnd) {
          const startX = timeScale.timeToCoordinate(currentOpenStart.timeSec as any);
          const endX = timeScale.timeToCoordinate(currentOpenEnd.timeSec as any);
          if (startX !== null && endX !== null) {
            // Expand slightly to cover full bar width
            const barSpacing = Math.abs(endX - startX) / Math.max(1, i - 1);
            segments.push({
              type: "NY_OPEN_WINDOW",
              startX: (startX as number) - 6,
              endX: (endX as number) + 12,
              label: "09:30–10:00 RETRACE WINDOW"
            });
          }
          currentOpenStart = null;
          currentOpenEnd = null;
        }
      }

      // Globex session tracking
      if (isGlobex) {
        if (!currentGlobexStart) currentGlobexStart = bar;
        currentGlobexEnd = bar;
      } else {
        if (currentGlobexStart && currentGlobexEnd) {
          const startX = timeScale.timeToCoordinate(currentGlobexStart.timeSec as any);
          const endX = timeScale.timeToCoordinate(currentGlobexEnd.timeSec as any);
          if (startX !== null && endX !== null) {
            segments.push({
              type: "GLOBEX",
              startX: (startX as number) - 4,
              endX: (endX as number) + 4,
              label: "GLOBEX OVERNIGHT (18:00–09:30)"
            });
          }
          currentGlobexStart = null;
          currentGlobexEnd = null;
        }
      }
    }

    // Flush open trailing session if currently active
    if (currentOpenStart && currentOpenEnd) {
      const startX = timeScale.timeToCoordinate(currentOpenStart.timeSec as any);
      const endX = timeScale.timeToCoordinate(currentOpenEnd.timeSec as any);
      if (startX !== null) {
        const effectiveEndX = endX !== null ? (endX as number) + 24 : (startX as number) + 40;
        segments.push({
          type: "NY_OPEN_WINDOW",
          startX: (startX as number) - 6,
          endX: effectiveEndX,
          label: "09:30–10:00 RETRACE WINDOW"
        });
      }
    }

    if (currentGlobexStart && currentGlobexEnd) {
      const startX = timeScale.timeToCoordinate(currentGlobexStart.timeSec as any);
      const endX = timeScale.timeToCoordinate(currentGlobexEnd.timeSec as any);
      if (startX !== null) {
        const effectiveEndX =
          endX !== null ? Math.max((endX as number) + 8, (startX as number) + 16) : (startX as number) + 20;
        segments.push({
          type: "GLOBEX",
          startX: (startX as number) - 4,
          endX: effectiveEndX,
          label: "GLOBEX OVERNIGHT (18:00–09:30)"
        });
      }
    }

    this._renderer.setData(segments);
  }
}

// ---------------------------------------------------------------------------
// 2. HORIZONTAL RETRACE ZONE BOX PRIMITIVE
// ---------------------------------------------------------------------------
class HorizontalRetraceZoneRenderer implements IPrimitivePaneRenderer {
  private _y1: number | null = null;
  private _y2: number | null = null;
  private _label: string = "";
  private _lowPrice: number = 0;
  private _highPrice: number = 0;
  private _bias: "BULLISH" | "BEARISH" | "NEUTRAL" = "BULLISH";

  setData(
    y1: number | null,
    y2: number | null,
    lowPrice: number,
    highPrice: number,
    label: string,
    bias: "BULLISH" | "BEARISH" | "NEUTRAL"
  ) {
    this._y1 = y1;
    this._y2 = y2;
    this._lowPrice = lowPrice;
    this._highPrice = highPrice;
    this._label = label;
    this._bias = bias;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._y1 === null || this._y2 === null) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const top = Math.min(this._y1!, this._y2!);
      const bottom = Math.max(this._y1!, this._y2!);
      const height = Math.max(bottom - top, 2);

      const isBullish = this._bias === "BULLISH";
      const isBearish = this._bias === "BEARISH";

      const fillColor = isBullish
        ? "rgba(34, 211, 238, 0.10)"
        : isBearish
        ? "rgba(244, 63, 94, 0.10)"
        : "rgba(148, 163, 184, 0.08)";

      const strokeColor = isBullish
        ? "rgba(34, 211, 238, 0.40)"
        : isBearish
        ? "rgba(244, 63, 94, 0.40)"
        : "rgba(148, 163, 184, 0.35)";

      const textColor = isBullish ? "#38bdf8" : isBearish ? "#fb7185" : "#cbd5e1";
      const pillBg = isBullish
        ? "rgba(8, 47, 73, 0.85)"
        : isBearish
        ? "rgba(76, 5, 25, 0.85)"
        : "rgba(30, 41, 59, 0.85)";

      // Soft translucent fill
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, top, mediaSize.width, height);

      // Dashed upper and lower boundary lines
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(mediaSize.width, top);
      ctx.moveTo(0, bottom);
      ctx.lineTo(mediaSize.width, bottom);
      ctx.stroke();
      ctx.restore();

      // Label Pill inside the zone
      ctx.save();
      ctx.font = "bold 9px monospace";
      const tag = `${this._label} (${this._lowPrice.toFixed(1)} – ${this._highPrice.toFixed(1)})`;
      const textMetrics = ctx.measureText(tag);
      const pillW = textMetrics.width + 10;
      const pillH = 16;
      const pillY = top + 2;

      ctx.fillStyle = pillBg;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.fillRect(10, pillY, pillW, pillH);
      ctx.strokeRect(10, pillY, pillW, pillH);

      ctx.fillStyle = textColor;
      ctx.fillText(tag, 15, pillY + 11);
      ctx.restore();
    });
  }
}

export class HorizontalRetraceZonePrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _lowPrice: number = 0;
  private _highPrice: number = 0;
  private _label: string = "RETRACE ZONE";
  private _bias: "BULLISH" | "BEARISH" | "NEUTRAL" = "BULLISH";
  private _enabled: boolean = true;
  private _renderer = new HorizontalRetraceZoneRenderer();
  private _paneView: IPrimitivePaneView;
  private _views: readonly IPrimitivePaneView[];

  constructor() {
    this._paneView = {
      zOrder: (): PrimitivePaneViewZOrder => "bottom",
      renderer: (): IPrimitivePaneRenderer => this._renderer
    };
    this._views = [this._paneView];
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this.updateAllViews();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views;
  }

  setZone(
    lowPrice: number,
    highPrice: number,
    label: string,
    bias: "BULLISH" | "BEARISH" | "NEUTRAL"
  ): void {
    this._lowPrice = Math.min(lowPrice, highPrice);
    this._highPrice = Math.max(lowPrice, highPrice);
    this._label = label;
    this._bias = bias;
    this.updateAllViews();
    this._requestUpdate?.();
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.updateAllViews();
    this._requestUpdate?.();
  }

  updateAllViews(): void {
    if (!this._series || !this._enabled || this._lowPrice <= 0 || this._highPrice <= 0) {
      this._renderer.setData(null, null, 0, 0, "", "NEUTRAL");
      return;
    }

    const y1 = this._series.priceToCoordinate(this._highPrice);
    const y2 = this._series.priceToCoordinate(this._lowPrice);

    this._renderer.setData(
      y1 !== null ? (y1 as number) : null,
      y2 !== null ? (y2 as number) : null,
      this._lowPrice,
      this._highPrice,
      this._label,
      this._bias
    );
  }
}
