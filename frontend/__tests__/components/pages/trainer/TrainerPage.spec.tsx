import { LayoutObject } from "@monkeytype/schemas/layouts";
import { render, screen } from "@solidjs/testing-library";
import { readFileSync } from "fs";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrainerPage } from "../../../../src/ts/components/pages/trainer/TrainerPage";
import { setConfigStore } from "../../../../src/ts/config/store";
import * as Core from "../../../../src/ts/states/core";
import * as TestState from "../../../../src/ts/states/test";
import {
  Attempt,
  LESSONS,
  replaceProgress,
  resetProgress,
} from "../../../../src/ts/trainer/lessons";
import * as Session from "../../../../src/ts/trainer/session";

vi.mock("../../../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
vi.mock("../../../../src/ts/trainer/session", () => ({
  getActiveLesson: vi.fn(),
}));
vi.mock("../../../../src/ts/trainer/actions", () => ({
  beginLesson: vi.fn(),
}));
vi.mock("../../../../src/ts/components/common/ChartJs", () => ({
  ChartJs: (props: { name: string; data: unknown; options: unknown }) => (
    <canvas
      data-testid="chart"
      data-name={props.name}
      data-chart={JSON.stringify({ data: props.data, options: props.options })}
    />
  ),
}));

type MockedChart = {
  data: {
    labels: number[];
    datasets: { yAxisID: string; data: number[] }[];
  };
  options: {
    scales: Record<string, { position?: string }>;
    plugins: {
      annotation: { annotations: { scaleID: string; value: number }[] };
    };
  };
};

function chartOf(canvas: HTMLElement): MockedChart {
  return JSON.parse(canvas.getAttribute("data-chart") ?? "{}") as MockedChart;
}
vi.mock("../../../../src/ts/utils/json-data", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLayout: async (name: string) => readLayout(name),
}));

function readLayout(name: string): LayoutObject {
  return JSON.parse(
    readFileSync(
      `${import.meta.dirname}/../../../../static/layouts/${name}.json`,
      "utf-8",
    ),
  ) as LayoutObject;
}

const qwerty = readLayout("qwerty");

function attempt(
  lesson: string,
  wpm: number,
  acc: number,
  layout = "qwerty",
): Attempt {
  return { lesson, layout, wpm, acc, perKey: {}, ts: wpm };
}

describe("TrainerPage", () => {
  const [activeLesson, setActiveLesson] = createSignal<number | null>(null);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Session.getActiveLesson).mockImplementation(() => activeLesson());
    vi.spyOn(TestState, "inputLayoutObject").mockReturnValue(qwerty);
    vi.spyOn(TestState, "isTestActive").mockReturnValue(false);
    vi.spyOn(Core, "getActivePage").mockReturnValue("trainer");
    setActiveLesson(null);
    resetProgress();
    setConfigStore("layout", "default");
    setConfigStore("keymapLayout", "overrideSync");
  });

  it("lists every lesson and hides the chart without attempts", () => {
    render(() => <TrainerPage />);
    expect(screen.getAllByRole("button", { name: /home row/ })).toHaveLength(2);
    expect(screen.queryByTestId("chart")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the chart and one table row per lesson once the layout has attempts", () => {
    replaceProgress({
      version: 2,
      layouts: {
        qwerty: { current: 1, unlocked: 1, best: { "home-row": 44.4 } },
      },
      attempts: [
        attempt("home-row", 44.4, 99),
        attempt("home-row", 31.6, 96.4),
        attempt("e-i", 60, 100, "dvorak"),
      ],
    });
    render(() => <TrainerPage />);
    expect(screen.getByTestId("chart")).toHaveAttribute(
      "data-name",
      "TrainerAttempts",
    );
    const chart = chartOf(screen.getByTestId("chart"));
    expect(chart.data.labels).toEqual([1, 2]);
    expect(chart.data.datasets.map((set) => set.yAxisID)).toEqual([
      "wpm",
      "acc",
    ]);
    expect(chart.data.datasets[0]?.data).toEqual([44.4, 31.6]);
    expect(chart.data.datasets[1]?.data).toEqual([99, 96.4]);
    expect(chart.options.scales["wpm"]?.position).toBe("left");
    expect(chart.options.scales["acc"]?.position).toBe("right");
    expect(chart.options.plugins.annotation.annotations).toMatchObject([
      { scaleID: "wpm", value: 30 },
      { scaleID: "acc", value: 97 },
    ]);
    setConfigStore("trainerUnlock", "strict");
    expect(
      chartOf(screen.getByTestId("chart")).options.plugins.annotation
        .annotations,
    ).toMatchObject([
      { scaleID: "wpm", value: 35 },
      { scaleID: "acc", value: 98 },
    ]);
    setConfigStore("trainerUnlock", "normal");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(LESSONS.length);
    expect(rows[0]).toHaveTextContent("1. home row");
    expect(rows[0]).toHaveTextContent("2");
    expect(rows[0]).toHaveTextContent("44");
    expect(rows[0]).toHaveTextContent("32");
    expect(rows[0]).toHaveTextContent("96%");
    expect(rows[0]).toHaveTextContent("unlocked");
    expect(rows[1]).toHaveTextContent("2. e i");
    expect(rows[1]).toHaveTextContent("current");
    expect(rows[2]).toHaveTextContent("locked");
  });

  it("hides the chart for a layout without attempts", () => {
    replaceProgress({
      version: 2,
      layouts: {},
      attempts: [attempt("home-row", 40, 99, "dvorak")],
    });
    render(() => <TrainerPage />);
    expect(screen.queryByTestId("chart")).toBeNull();
    setConfigStore("layout", "dvorak");
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
});
