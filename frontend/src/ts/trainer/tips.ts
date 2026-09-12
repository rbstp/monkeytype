import { Finger, FINGER_LABEL, FINGERS } from "./finger";
import { accuracy, FingerSummary, RankedKey } from "./key-stats";

type TipInput = {
  acc?: number;
  consistency?: number;
  fingers: Record<Finger, FingerSummary>;
  weakKeys: (RankedKey & { legend: string })[];
};

const targetAcc = 97;
const lowConsistency = 60;
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

export function buildTips(input: TipInput): string[] {
  const tips: string[] = [];

  if (input.acc !== undefined && input.acc < targetAcc) {
    tips.push(
      `Accuracy first: slow down until you hold ${targetAcc}%. Speed follows on its own.`,
    );
  } else if (input.acc !== undefined) {
    tips.push(
      "Accuracy is on target. Push the pace a little and keep it there.",
    );
  }

  if (input.consistency !== undefined && input.consistency < lowConsistency) {
    tips.push(
      "The dips in the chart are pauses to find a key. Keep every finger on its home key and return there after each press.",
    );
  }

  const finger = weakestFinger(input.fingers);
  if (finger !== undefined) {
    const keys = input.weakKeys
      .filter((key) => key.finger === finger)
      .map((key) => key.legend)
      .slice(0, 3);
    const keyHint = keys.length === 0 ? "" : ` Watch ${keys.join(" ")}.`;
    tips.push(
      `Weakest finger: ${FINGER_LABEL[finger]} at ${Math.round(accuracy(input.fingers[finger]))}%.${keyHint} Say the letter as you press it for a few tests.`,
    );
  }

  return tips.slice(0, maxTips);
}
