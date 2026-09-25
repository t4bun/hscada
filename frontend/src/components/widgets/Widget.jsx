import { Label, Rect, CircleShape, Line, ImageW } from "./Basic";
import { ButtonW, SwitchW, Lamp, Numeric, NumericInput, SliderW } from "./Controls";
import { Gauge, Bar, Tank } from "./Visuals";
import { Trend, HistoryTrend, DataRecord, AlarmTable } from "./DataWidgets";
import { BitButton, WordButton, BitLamp, WordLamp, CharDisplay, FuncButton } from "./MultiState";
import { SymbolW } from "./Symbols";
import { WIDGETS } from "./registry";
import { AlertTriangle } from "lucide-react";
import { assetUrl } from "@/lib/api";
import { useRt } from "@/hooks/useLive";

const MAP = {
  label: Label, rect: Rect, circle: CircleShape, line: Line, image: ImageW,
  button: ButtonW, switch: SwitchW, lamp: Lamp, numeric: Numeric, numeric_input: NumericInput, slider: SliderW,
  gauge: Gauge, bar: Bar, tank: Tank,
  trend: Trend, history: HistoryTrend, alarm_table: AlarmTable, data_record: DataRecord,
  bit_button: BitButton, word_button: WordButton, bit_lamp: BitLamp, word_lamp: WordLamp, char_display: CharDisplay, func_button: FuncButton,
  sym_pump: SymbolW, sym_valve: SymbolW, sym_motor: SymbolW, sym_conveyor: SymbolW, sym_fan: SymbolW,
};

export const WidgetView = ({ w }) => {
  const C = MAP[w.type];
  if (!C) return null;
  const p = { ...(WIDGETS[w.type]?.props || {}), ...(w.props || {}) };
  return <C p={p} w={w} />;
};

const BadBadge = () => (
  <span data-testid="widget-bad-quality" title="Bad/Offline — menampilkan nilai terakhir" className="absolute -top-2 -right-2 z-10 w-5 h-5 grid place-items-center rounded-full bg-amber-500 text-slate-950 shadow pointer-events-none">
    <AlertTriangle size={11} strokeWidth={2.5} />
  </span>
);

export const ScreenView = ({ screen, width, height }) => {
  const { quality } = useRt();
  return (
  <div
    className="relative overflow-hidden"
    style={{
      width, height, background: screen.bg_color,
      backgroundImage: screen.bg_image ? `url(${assetUrl(screen.bg_image)})` : undefined, backgroundSize: "cover", backgroundPosition: "center",
    }}
  >
    {screen.widgets.map((w) => (
      <div key={w.id} data-testid={`runtime-widget-${w.type}`} className="absolute" style={{ left: w.x, top: w.y, width: w.w, height: w.h }}>
        <WidgetView w={w} />
        {quality?.[w.props?.tag] === "bad" && <BadBadge />}
      </div>
    ))}
  </div>
  );
};
