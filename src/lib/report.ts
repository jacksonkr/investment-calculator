import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { formatCompact, formatMoney } from "@/lib/format";
import { NATIVE } from "@/lib/native";
import type { Inputs } from "@/lib/simulate";

/** Everything a shared report shows, already worded and formatted. */
export type Report = {
  /** What was modeled, e.g. "S&P 500 · what really happened". */
  subject: string;
  /** The sentence leading into the headline amount. */
  lead: string;
  headline: string;
  caption: string;
  chart: {
    /** One label per point; the first, middle and last are drawn. */
    labels: string[];
    lines: { values: number[]; color: "growth" | "contrib"; label: string }[];
    /** A shaded range of outcomes, drawn under the lines. */
    band?: { low: number[]; high: number[]; label: string };
  };
  stats: { label: string; value: string }[];
  /** The plan's inputs in one line. */
  plan: string;
  /** The message sent along with the image. */
  text: string;
};

/**
 * The plan's contributions in words: a "line" for the image's footer, or a
 * "sentence" fragment such as "$5,000 plus $300 a month" for the message.
 */
export function describePlan(inputs: Inputs, form: "line" | "sentence" = "line") {
  const parts: string[] = [];
  if (inputs.initial > 0) parts.push(`${formatMoney(inputs.initial)}${form === "line" ? " to start" : ""}`);
  if (inputs.monthly > 0) parts.push(`${formatMoney(inputs.monthly)} a month`);
  if (parts.length === 0) parts.push("$0");
  if (inputs.monthly > 0 && inputs.contributionGrowthPct > 0) {
    parts.push(`raised ${inputs.contributionGrowthPct}% a year`);
  }
  if (form === "sentence") return parts.length > 1 ? `${parts[0]} plus ${parts.slice(1).join(", ")}` : parts[0];
  if (inputs.feePct > 0) parts.push(`${inputs.feePct}% yearly fee`);
  return parts.join(" · ");
}

// The image always uses the light palette so it reads well in any chat.
const COLORS = {
  page: "#f9f9f7",
  surface: "#ffffff",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  hairline: "rgba(11, 11, 11, 0.1)",
  growth: "#2a78d6",
  contrib: "#eb6834",
};

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 72;

/** Lines of `text` that fit within `width` at the context's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A round axis maximum and step giving at most four gridlines. */
function niceScale(max: number) {
  const rough = Math.max(max, 1) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  return { step, max: Math.ceil(max / step) * step };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  chart: Report["chart"],
  font: string,
  box: { x: number; y: number; w: number; h: number },
) {
  const left = box.x + 110;
  const right = box.x + box.w - 20;
  const top = box.y + 64;
  const bottom = box.y + box.h - 48;
  const count = chart.labels.length;
  const peak = Math.max(
    ...chart.lines.flatMap((line) => line.values),
    ...(chart.band?.high ?? []),
  );
  const { step, max } = niceScale(peak);
  const x = (i: number) => left + ((right - left) * i) / Math.max(1, count - 1);
  const y = (v: number) => bottom - ((bottom - top) * v) / max;

  // Legend
  ctx.font = `400 26px ${font}`;
  ctx.textBaseline = "middle";
  let lx = box.x;
  const legend = [
    ...chart.lines.map((line) => ({ label: line.label, color: COLORS[line.color], band: false })),
    ...(chart.band ? [{ label: chart.band.label, color: COLORS.growth, band: true }] : []),
  ];
  for (const item of legend) {
    const width = 34 + ctx.measureText(item.label).width + 32;
    if (lx + width > box.x + box.w) break;
    ctx.fillStyle = item.color;
    if (item.band) {
      ctx.globalAlpha = 0.3;
      ctx.fillRect(lx, box.y + 6, 22, 22);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillRect(lx, box.y + 15, 24, 5);
    }
    ctx.fillStyle = COLORS.ink2;
    ctx.fillText(item.label, lx + 34, box.y + 17);
    lx += width;
  }

  // Gridlines and value labels
  ctx.font = `400 24px ${font}`;
  ctx.textAlign = "right";
  for (let v = 0; v <= max + step / 2; v += step) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, y(v));
    ctx.lineTo(right, y(v));
    ctx.stroke();
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(formatCompact(v), left - 16, y(v));
  }

  // Time labels
  ctx.textBaseline = "top";
  const middle = Math.round((count - 1) / 2);
  for (const [i, align] of [[0, "left"], [middle, "center"], [count - 1, "right"]] as const) {
    ctx.textAlign = align;
    ctx.fillText(chart.labels[i], x(i), bottom + 14);
  }

  const trace = (values: number[]) => values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));

  if (chart.band) {
    const { low, high } = chart.band;
    ctx.beginPath();
    trace(high);
    for (let i = count - 1; i >= 0; i--) ctx.lineTo(x(i), y(low[i]));
    ctx.closePath();
    ctx.fillStyle = COLORS.growth;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Shade under each line when there's no band, as the app's charts do.
  if (!chart.band) {
    for (const line of chart.lines) {
      ctx.beginPath();
      trace(line.values);
      ctx.lineTo(x(count - 1), y(0));
      ctx.lineTo(x(0), y(0));
      ctx.closePath();
      ctx.fillStyle = COLORS[line.color];
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const line of [...chart.lines].reverse()) {
    ctx.beginPath();
    trace(line.values);
    ctx.strokeStyle = COLORS[line.color];
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x(count - 1), y(line.values[count - 1]), 9, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[line.color];
    ctx.fill();
  }
}

/** Draws the report as a 1080 × 1350 PNG. */
async function renderReport(report: Report): Promise<Blob> {
  await document.fonts.ready;
  const font = getComputedStyle(document.body).fontFamily;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const inner = WIDTH - PAD * 2;

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.growth;
  ctx.font = `600 28px ${font}`;
  ctx.fillText("INVEST CALC", PAD, PAD + 20);
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `400 28px ${font}`;
  ctx.textAlign = "right";
  ctx.fillText(report.subject, WIDTH - PAD, PAD + 20);
  ctx.textAlign = "left";

  let y = PAD + 92;
  ctx.font = `400 34px ${font}`;
  for (const line of wrap(ctx, report.lead, inner)) {
    ctx.fillText(line, PAD, y);
    y += 46;
  }
  y += 88;
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 116px ${font}`;
  ctx.fillText(report.headline, PAD, y);
  y += 56;
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `400 32px ${font}`;
  for (const line of wrap(ctx, report.caption, inner)) {
    ctx.fillText(line, PAD, y);
    y += 44;
  }

  // The stats and footer sit at the bottom; the chart fills what's left, so
  // a lead that wraps onto a second line shortens the chart, not the rest.
  const gap = 20;
  const tileWidth = (inner + 48 - gap) / 2;
  const tileHeight = 108;
  const statsTop = HEIGHT - PAD - 38 - 58 - (tileHeight * 2 + gap);
  y += 20;
  const chartHeight = statsTop - 24 - y;
  roundRect(ctx, PAD - 24, y, inner + 48, chartHeight, 28);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();
  ctx.strokeStyle = COLORS.hairline;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawChart(ctx, report.chart, font, { x: PAD, y: y + 28, w: inner, h: chartHeight - 40 });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Stats, two per row
  report.stats.slice(0, 4).forEach((stat, i) => {
    const tx = PAD - 24 + (i % 2) * (tileWidth + gap);
    const ty = statsTop + Math.floor(i / 2) * (tileHeight + gap);
    roundRect(ctx, tx, ty, tileWidth, tileHeight, 22);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.strokeStyle = COLORS.hairline;
    ctx.stroke();
    ctx.fillStyle = COLORS.ink2;
    ctx.font = `400 24px ${font}`;
    ctx.fillText(stat.label, tx + 24, ty + 40);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 38px ${font}`;
    ctx.fillText(stat.value, tx + 24, ty + 86);
  });

  ctx.fillStyle = COLORS.ink2;
  ctx.font = `400 26px ${font}`;
  ctx.fillText(report.plan, PAD, HEIGHT - PAD - 38);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 22px ${font}`;
  ctx.fillText("Hypothetical and for education only. Not financial advice.", PAD, HEIGHT - PAD);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the report"))), "image/png"),
  );
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const FILE_NAME = "investment-report.png";

/**
 * Opens the share sheet with the report as an image plus a short message.
 * Where files can't be shared (most desktop browsers) the image is
 * downloaded instead. Resolves to what happened.
 */
export async function shareReport(report: Report, link?: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const image = await renderReport(report);
  const text = link ? `${report.text}\n\n${link}` : report.text;

  try {
    if (NATIVE) {
      const { uri } = await Filesystem.writeFile({
        path: FILE_NAME,
        data: await toBase64(image),
        directory: Directory.Cache,
      });
      await Share.share({ title: "Investment report", text, files: [uri] });
      return "shared";
    }
    const file = new File([image], FILE_NAME, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return "shared";
    }
  } catch (error) {
    // Dismissing the share sheet rejects too, which is not a failure.
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/abort|cancel/i.test(message)) return "cancelled";
    throw error;
  }

  const url = URL.createObjectURL(image);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = FILE_NAME;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
