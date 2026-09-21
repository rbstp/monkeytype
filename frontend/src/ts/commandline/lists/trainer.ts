import { navigate } from "../../controllers/route-controller";
import { showModal } from "../../states/modals";
import { showSuccessNotification } from "../../states/notifications";
import { inputLayoutObject, isTestActive } from "../../states/test";
import * as TestLogic from "../../test/test-logic";
import {
  beginDrill,
  beginLesson,
  beginReview,
  beginWarmUp,
  exportBackupFile,
  requestImport,
} from "../../trainer/actions";
import { resetConfusions } from "../../trainer/confusions";
import { resetKeyHistory } from "../../trainer/history";
import { resetKeyStats } from "../../trainer/key-stats";
import {
  currentLesson,
  lessonAvailable,
  lessonName,
  lessonNumber,
  LESSONS,
  nextLesson,
  progressLayout,
  resetProgress,
  unlockedUpTo,
} from "../../trainer/lessons";
import {
  getActiveLesson,
  isSessionActive,
  stopLesson,
} from "../../trainer/session";
import { resetTransitions } from "../../trainer/transitions";
import { Command, CommandsSubgroup } from "../types";

const icon = "fa-graduation-cap";

const notDuringTest = (): boolean => !isTestActive();

function lessonDisplay(index: number): string {
  const locked = unlockedUpTo() < index ? " (locked)" : "";
  const lesson = LESSONS[index];
  const name =
    lesson === undefined ? "" : lessonName(lesson, inputLayoutObject());
  return `${lessonNumber(index, progressLayout())}. ${name}${locked}`;
}

const lessonList: CommandsSubgroup = {
  title: "Trainer: choose lesson...",
  list: LESSONS.map((lesson, index) => ({
    id: `trainerLesson${index}`,
    display: lessonDisplay(index),
    icon,
    available: (): boolean =>
      notDuringTest() && lessonAvailable(lesson, progressLayout()),
    active: (): boolean => getActiveLesson() === index,
    exec: (): void => void beginLesson(index),
  })),
  beforeList: (): void => {
    for (const [index, command] of lessonList.list.entries()) {
      command.display = lessonDisplay(index);
    }
  },
};

const commands: Command[] = [
  {
    id: "trainerContinue",
    display: "Trainer: continue lesson",
    alias: "typing tutor practice",
    icon,
    available: notDuringTest,
    exec: (): void => void beginLesson(currentLesson()),
  },
  {
    id: "trainerNext",
    display: "Trainer: next lesson",
    icon,
    available: (): boolean => {
      const next = nextLesson(currentLesson(), progressLayout());
      return notDuringTest() && next !== undefined && unlockedUpTo() >= next;
    },
    exec: (): void =>
      void beginLesson(nextLesson(currentLesson(), progressLayout()) ?? 0),
  },
  {
    id: "trainerOpen",
    display: "Trainer: open page",
    alias: "trainer page navigate go to",
    icon,
    exec: (): void => void navigate("/trainer"),
  },
  {
    id: "trainerChoose",
    display: "Trainer: choose lesson...",
    icon,
    available: notDuringTest,
    subgroup: lessonList,
  },
  {
    id: "trainerPick",
    display: "Trainer: pick lesson",
    alias: "map modal picker",
    icon,
    available: notDuringTest,
    opensModal: true,
    exec: (): void => showModal("lessonPicker"),
  },
  {
    id: "trainerDrill",
    display: "Trainer: drill weak keys",
    alias: "practice slow error-prone",
    icon,
    available: notDuringTest,
    exec: (): void => void beginDrill(),
  },
  {
    id: "trainerWarmUp",
    display: "Trainer: warm-up",
    alias: "start practice unlocked keys",
    icon,
    available: notDuringTest,
    exec: (): void => void beginWarmUp(),
  },
  {
    id: "trainerReview",
    display: "Trainer: review",
    alias: "practice slipped slower keys",
    icon,
    available: notDuringTest,
    exec: (): void => void beginReview(),
  },
  {
    id: "trainerStop",
    display: "Trainer: stop",
    icon,
    available: (): boolean => notDuringTest() && isSessionActive(),
    exec: (): void => {
      stopLesson();
      void TestLogic.restart();
    },
  },
  {
    id: "trainerExport",
    display: "Trainer: export data",
    alias: "backup download file",
    icon,
    available: notDuringTest,
    exec: exportBackupFile,
  },
  {
    id: "trainerImport",
    display: "Trainer: import data",
    alias: "restore backup upload file",
    icon,
    available: notDuringTest,
    exec: (): void => {
      void navigate("/trainer").then(requestImport);
    },
  },
  {
    id: "trainerResetKeyStats",
    display: "Trainer: reset key stats",
    icon,
    available: notDuringTest,
    exec: (): void => {
      resetKeyStats();
      resetConfusions();
      resetTransitions();
      resetKeyHistory();
      showSuccessNotification("Key stats reset");
    },
  },
  {
    id: "trainerResetProgress",
    display: "Trainer: reset lesson progress",
    icon,
    available: notDuringTest,
    exec: (): void => {
      resetProgress();
      showSuccessNotification("Lesson progress reset");
    },
  },
];

export default commands;
