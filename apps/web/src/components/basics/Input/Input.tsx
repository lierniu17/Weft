import { type InputHTMLAttributes, type Ref, useId, useState } from "react";
import { FiEye, FiEyeOff, FiSearch } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { IconButton } from "../IconButton/IconButton.tsx";

export type InputVariant = "default" | "search" | "password";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  variant?: InputVariant;
  /** Error message: turns the border red and is announced as the input's description. */
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ variant = "default", error, disabled, className, ...rest }: InputProps) {
  const [revealed, setRevealed] = useState(false);
  const helperId = useId();
  const type =
    variant === "search" ? "search" : variant === "password" && !revealed ? "password" : "text";

  return (
    <div className={cx("flex flex-col gap-xs", className)}>
      <div className="relative">
        {variant === "search" && (
          <FiSearch
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-sm -translate-y-1/2 text-neutral-text-secondary"
          />
        )}
        <input
          type={type}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? helperId : undefined}
          className={cx(
            "motion-colors h-[40px] w-full rounded-sm border px-sm text-body-md text-neutral-text-primary outline-none",
            "placeholder:text-neutral-text-disabled focus:border-primary-6",
            "disabled:cursor-not-allowed disabled:bg-neutral-bg-layout disabled:text-neutral-text-disabled",
            variant === "search"
              ? "border-transparent bg-neutral-bg-layout pl-xl"
              : "bg-neutral-bg-container",
            variant !== "search" && !error && "border-neutral-border",
            error && "border-status-error-6",
            variant === "password" && "pr-xxl",
          )}
          {...rest}
        />
        {variant === "password" && (
          <IconButton
            size="sm"
            variant="plain"
            aria-label={revealed ? "隐藏密码" : "显示密码"}
            aria-pressed={revealed}
            icon={revealed ? <FiEyeOff /> : <FiEye />}
            disabled={disabled}
            onClick={() => setRevealed((v) => !v)}
            className="absolute top-1/2 right-xs -translate-y-1/2"
          />
        )}
      </div>
      {error && (
        <p id={helperId} className="text-caption text-status-error-6">
          {error}
        </p>
      )}
    </div>
  );
}
