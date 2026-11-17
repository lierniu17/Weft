/** "#4F46E5" -> "rgb(79, 70, 229)", the form getComputedStyle reports. */
export function rgb(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
