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

export interface RiskBoxData {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stopPts: number;
  targetPts: number;
  rawRR: number;
  netRR?: number;
  contracts?: number;
  instrument?: "NQ" | "MNQ";
  visible: boolean;
}

class RiskBoxRenderer implements IPrimitivePaneRenderer {
  private _data: RiskBoxData | null = null;
  private _entryY: number | null = null;
  private _stopY: number | null = null;
  private _targetY: number | null = null;

  setData(
    data: RiskBoxData | null,
    entryY: number | null,
    stopY: number | null,
    targetY: number | null
  ) {
    this._data = data;
    this._entryY = entryY;
    this._stopY = stopY;
    this._targetY = targetY;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._data || !this._data.visible) return;
    if (this._entryY === null || this._stopY === null || this._targetY === null) return;

    const data = this._data;
    const entryY = this._entryY;
    const stopY = this._stopY;
    const targetY = this._targetY;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const left = 0;
      const width = mediaSize.width;

      // 1. Draw Red Risk Zone (Entry to Stop)
      const riskTop = Math.min(entryY, stopY);
      const riskBottom = Math.max(entryY, stopY);
      const riskHeight = Math.max(1, riskBottom - riskTop);

      ctx.save();
      ctx.fillStyle = "rgba(244, 63, 94, 0.15)"; // Red 500 @ 15%
      ctx.fillRect(left, riskTop, width, riskHeight);

      // Stop Loss boundary line
      ctx.strokeStyle = "rgba(244, 63, 94, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, stopY);
      ctx.lineTo(width, stopY);
      ctx.stroke();

      // 2. Draw Green Reward Zone (Entry to Target)
      const rewardTop = Math.min(entryY, targetY);
      const rewardBottom = Math.max(entryY, targetY);
      const rewardHeight = Math.max(1, rewardBottom - rewardTop);

      ctx.fillStyle = "rgba(16, 185, 129, 0.15)"; // Emerald 500 @ 15%
      ctx.fillRect(left, rewardTop, width, rewardHeight);

      // Target boundary line
      ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, targetY);
      ctx.lineTo(width, targetY);
      ctx.stroke();

      // Entry line (center dashed white line)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, entryY);
      ctx.lineTo(width, entryY);
      ctx.stroke();
      ctx.restore();

      // 3. Draw Clean In-Canvas Right Badges / Labels
      ctx.save();
      ctx.font = "bold 10px monospace";
      const rightX = Math.max(10, width - 240);

      // Entry Label
      const entryText = `ENTRY: ${data.entryPrice.toFixed(2)}`;
      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1;
      ctx.fillRect(rightX, entryY - 10, 150, 18);
      ctx.strokeRect(rightX, entryY - 10, 150, 18);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(entryText, rightX + 6, entryY + 3);

      // Stop Label
      const stopText = `STOP: ${data.stopPrice.toFixed(2)} (-${data.stopPts.toFixed(1)} pts)`;
      ctx.fillStyle = "rgba(69, 10, 10, 0.9)";
      ctx.strokeStyle = "rgba(244, 63, 94, 0.8)";
      ctx.fillRect(rightX, stopY - 10, 200, 18);
      ctx.strokeRect(rightX, stopY - 10, 200, 18);
      ctx.fillStyle = "#f87171";
      ctx.fillText(stopText, rightX + 6, stopY + 3);

      // Target Label
      const rrStr = data.netRR !== undefined ? `${data.netRR.toFixed(2)}R net` : `${data.rawRR.toFixed(2)}R`;
      const targetText = `TARGET: ${data.targetPrice.toFixed(2)} (+${data.targetPts.toFixed(1)} pts • ${rrStr})`;
      ctx.fillStyle = "rgba(6, 78, 59, 0.9)";
      ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
      ctx.fillRect(rightX, targetY - 10, 220, 18);
      ctx.strokeRect(rightX, targetY - 10, 220, 18);
      ctx.fillStyle = "#34d399";
      ctx.fillText(targetText, rightX + 6, targetY + 3);

      ctx.restore();
    });
  }
}

class RiskBoxPaneView implements IPrimitivePaneView {
  private _renderer = new RiskBoxRenderer();
  private _source: RiskBoxPrimitive;

  constructor(source: RiskBoxPrimitive) {
    this._source = source;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }

  update(): void {
    const data = this._source.data;
    const series = this._source.series;
    if (!data || !series || !data.visible) {
      this._renderer.setData(null, null, null, null);
      return;
    }

    const entryY = series.priceToCoordinate(data.entryPrice);
    const stopY = series.priceToCoordinate(data.stopPrice);
    const targetY = series.priceToCoordinate(data.targetPrice);

    this._renderer.setData(
      data,
      entryY !== null ? (entryY as number) : null,
      stopY !== null ? (stopY as number) : null,
      targetY !== null ? (targetY as number) : null
    );
  }
}

export class RiskBoxPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _paneView: RiskBoxPaneView;
  private _data: RiskBoxData | null = null;

  constructor() {
    this._paneView = new RiskBoxPaneView(this);
  }

  get data(): RiskBoxData | null {
    return this._data;
  }

  get series(): ISeriesApi<SeriesType, Time> | null {
    return this._series;
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._paneView.update();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  setData(data: RiskBoxData | null): void {
    this._data = data;
    this.update();
  }

  update(): void {
    this._paneView.update();
    if (this._chart) {
      this._chart.applyOptions({});
    }
  }
}
