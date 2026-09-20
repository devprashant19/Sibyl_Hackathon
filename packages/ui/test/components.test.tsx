import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clampPercent } from "../src/utils";
import { ProgressTrack } from "../src/components/ProgressTrack";
import { OracleConsole } from "../src/components/OracleConsole";
import { CodeBlock } from "../src/components/CodeBlock";
import { Button } from "../src/components/Button";

// packages/ui has no DOM test environment installed, so these render to static markup in node.

describe("clampPercent", () => {
  it("clamps to 0..100 and treats NaN/undefined as 0", () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(250)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(undefined)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("ProgressTrack", () => {
  const transformOf = (value: number) => {
    const html = renderToStaticMarkup(<ProgressTrack value={value} />);
    return /translateX\((-?[\d.]+)%\)/.exec(html)?.[1];
  };

  it("never produces a positive (invalid) offset for values above 100", () => {
    expect(transformOf(150)).toBe("-0");
  });

  it("never overshoots below -100% for negative values", () => {
    expect(transformOf(-10)).toBe("-100");
  });

  it("exposes the clamped value to assistive tech", () => {
    const html = renderToStaticMarkup(<ProgressTrack value={180} />);
    expect(html).toContain('aria-valuenow="100"');
  });
});

describe("OracleConsole", () => {
  it("renders without crashing when scenarios is empty", () => {
    expect(() => renderToStaticMarkup(<OracleConsole scenarios={[]} />)).not.toThrow();
    const html = renderToStaticMarkup(<OracleConsole scenarios={[]} />);
    expect(html).toContain("oracle-console");
    // No blinking cursor when there is nothing to type.
    expect(html).not.toContain("animate-pulse");
  });
});

describe("CodeBlock / Button", () => {
  it("accepts a language hint without leaking it as an unknown DOM prop", () => {
    const html = renderToStaticMarkup(<CodeBlock code="{}" language="json" />);
    expect(html).toContain('data-language="json"');
    expect(html).toContain('class="language-json"');
    expect(html).not.toContain(' language=');
  });

  it("defaults Button to type=button", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('type="button"');
  });
});
