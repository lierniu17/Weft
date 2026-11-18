import { useId } from "react";
import { cx } from "../../../lib/cx.ts";
import type { GraphThemeName } from "../../../lib/graph/scene.ts";
import { SegmentedControl } from "../../basics/SegmentedControl/SegmentedControl.tsx";

export type GraphAppearanceSettingProps = {
  value: GraphThemeName;
  onChange: (value: GraphThemeName) => void;
  disabled?: boolean;
  className?: string;
};

const OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "starfield", label: "星空" },
];

/** 我的 → 图谱外观 (graph-viz AC-18, style refresh AC-11): 浅色 / 星空, saved to the account. */
export function GraphAppearanceSetting({
  value,
  onChange,
  disabled,
  className,
}: GraphAppearanceSettingProps) {
  const hint = useId();
  return (
    <div
      className={cx("flex min-h-[56px] items-center justify-between gap-md px-md py-sm", className)}
    >
      <div className="flex min-w-[0] flex-col">
        <span className="text-body-md text-neutral-text-primary">图谱外观</span>
        <span id={hint} className="text-meta text-neutral-text-tertiary">
          只改变关系图，换设备登录后仍保持
        </span>
      </div>
      <SegmentedControl
        aria-label="图谱外观"
        size="sm"
        options={OPTIONS}
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(v === "starfield" ? "starfield" : "light")}
      />
    </div>
  );
}
