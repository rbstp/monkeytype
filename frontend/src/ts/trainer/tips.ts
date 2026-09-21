import { ConfusionKind } from "./confusions";
import { Finger, FINGER_LABEL, FINGERS } from "./finger";
import { accuracy, FingerSummary, RankedKey } from "./key-stats";

export type ConfusionTip = {
  expected: string;
  typed: string;
  kind: ConfusionKind;
  count: number;
};

type TipInput = {
  wpm?: number;
  acc?: number;
  consistency?: number;
  /** share of the test spent idle, 0 to 1 */
  afkShare?: number;
  fingers: Record<Finger, FingerSummary>;
  weakKeys: (RankedKey & { legend: string })[];
  confusions?: ConfusionTip[];
};

const targetAcc = 97;
const hunting = 20;
const lowConsistency = 60;
const highAfkShare = 0.1;
const minFingerSamples = 20;
const maxTips = 3;

function weakestFinger(
  fingers: Record<Finger, FingerSummary>,
): Finger | undefined {
  let weakest: Finger | undefined;
  for (const finger of FINGERS) {
    const summary = fingers[finger];
    if (summary.total < minFingerSamples || accuracy(summary) >= 95) continue;
    if (
      weakest === undefined ||
      accuracy(summary) < accuracy(fingers[weakest])
    ) {
      weakest = finger;
    }
  }
  return weakest;
}

function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function accuracyTip(input: TipInput): string | undefined {
  if (input.acc === undefined) return undefined;
  const acc = Math.round(input.acc);
  if (input.acc >= targetAcc) {
    return `Accuracy ${acc}% is on target. Push the pace a little and keep it there.`;
  }
  // below the target but already crawling: the misses come from reaching with
  // the wrong finger, so typing even slower does not help
  if (input.wpm !== undefined && input.wpm < hunting) {
    return `Accuracy ${acc}% at ${Math.round(input.wpm)} wpm: these are wrong-finger reaches, not speed. Keep every finger on its home key and let the finger hint under the keyboard lead.`;
  }
  return `Accuracy ${acc}%: slow down until you hold ${targetAcc}%. Speed follows on its own.`;
}

function rhythmTip(input: TipInput): string | undefined {
  if (input.afkShare !== undefined && input.afkShare >= highAfkShare) {
    return `${Math.round(input.afkShare * 100)}% of this test was idle. Staring at the keyboard teaches nothing. Keep a slow, unbroken rhythm instead.`;
  }
  if (input.consistency !== undefined && input.consistency < lowConsistency) {
    return `Consistency ${Math.round(input.consistency)}%: your pace swings between the keys you know and the ones you search for. Hold one steady speed, even a slow one.`;
  }
  return undefined;
}

function keysTip(input: TipInput): string | undefined {
  const errorProne = input.weakKeys
    .filter((key) => key.label === "error-prone")
    .slice(0, 3)
    .map((key) => `${key.legend} ${Math.round(100 - accuracy(key))}% missed`);
  const slow = input.weakKeys
    .filter((key) => key.label === "slow")
    .slice(0, 3)
    .map((key) => `${key.legend} ${duration(key.emaMs)}`);
  const finger = weakestFinger(input.fingers);
  const parts: string[] = [];
  if (errorProne.length > 0) {
    parts.push(`Error-prone keys: ${errorProne.join(", ")}`);
  }
  if (slow.length > 0) parts.push(`Slowest keys: ${slow.join(", ")}`);
  if (finger !== undefined) {
    parts.push(
      `weakest finger: ${FINGER_LABEL[finger]} at ${Math.round(accuracy(input.fingers[finger]))}%`,
    );
  }
  if (parts.length === 0) return undefined;
  return `${parts.join(", ")}. Say each letter as you press it for a few tests.`;
}

const confusionAdvice: Record<ConfusionKind, string> = {
  "same finger":
    "the same finger reaches the wrong row, so land on the home key between words",
  "mirror hand":
    "the same finger on the other hand answers, so say the letter before the reach",
  neighbour:
    "the finger drifts one key over, so keep the wrist still and let the finger travel",
  other:
    "an unrelated key answers, so slow down on that letter for a few tests",
};

function confusionTip(input: TipInput): string | undefined {
  const worst = input.confusions?.[0];
  if (worst === undefined) return undefined;
  return `You press ${worst.typed} when you mean ${worst.expected} (${worst.kind}, ${worst.count} times): ${confusionAdvice[worst.kind]}.`;
}

export function buildTips(input: TipInput): string[] {
  return [
    accuracyTip(input),
    rhythmTip(input),
    confusionTip(input),
    keysTip(input),
  ]
    .filter((tip): tip is string => tip !== undefined)
    .slice(0, maxTips);
}
