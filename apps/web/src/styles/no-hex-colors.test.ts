import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Style refresh AC-1: every colour comes from a DESIGN.md token. Component and page source
 * may not spell a colour as a hex literal; only the generated token files may. Stories and
 * tests are exempt (they assert computed colours), and so are other generated files.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED = [
  /^tokens\.gen\.ts$/,
  /^styles\/tokens\.css$/,
  /\.gen\.ts$/,
  /\.stories\.tsx?$/,
  /\.test\.tsx?$/,
  /^test\//,
];

// #RGB, #RGBA, #RRGGBB, #RRGGBBAA — as a whole word, so `#section-id` anchors don't match.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(e.name) ? [full] : [];
  });
}

function hexLiterals(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .flatMap((line) => line.match(HEX) ?? []);
}

describe("no hard-coded colours in component source (AC-1)", () => {
  it("detects hex literals but not comments", () => {
    expect(hexLiterals('const c = "#fff";')).toEqual(["#fff"]);
    expect(hexLiterals("color: #18181B80;")).toEqual(["#18181B80"]);
    expect(hexLiterals("// was #4F46E5")).toEqual([]);
    expect(hexLiterals('href="#main"')).toEqual([]);
  });

  it("finds none outside the token and generated files", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => relative(SRC, file).replaceAll("\\", "/"))
      .filter((rel) => !ALLOWED.some((re) => re.test(rel)))
      .flatMap((rel) =>
        hexLiterals(readFileSync(join(SRC, rel), "utf8")).map((hex) => `${rel}: ${hex}`),
      );
    expect(offenders).toEqual([]);
  });
});
