import {
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { isTestActive } from "../../states/test";
import * as TestLogic from "../../test/test-logic";
import { resetKeyStats } from "../../trainer/key-stats";
import { LESSONS, progress, resetProgress } from "../../trainer/lessons";
import {
  getActiveLesson,
  startLesson,
  stopLesson,
} from "../../trainer/session";
import { Command, CommandsSubgroup } from "../types";

const icon = "fa-graduation-cap";

const notDuringTest = (): boolean => !isTestActive();

async function begin(index: number): Promise<void> {
  if (progress().unlocked < index) {
    showNoticeNotification("Pass the previous lesson first.");
    return;
  }
  if (await startLesson(index)) await TestLogic.restart();
}

function lessonDisplay(index: number): string {
  const locked = progress().unlocked < index ? " (locked)" : "";
  return `${index + 1}. ${LESSONS[index]?.name}${locked}`;
}

const lessonList: CommandsSubgroup = {
  title: "Trainer: choose lesson...",
  list: LESSONS.map((_lesson, index) => ({
    id: `trainerLesson${index}`,
    display: lessonDisplay(index),
    icon,
    available: notDuringTest,
    active: (): boolean => getActiveLesson() === index,
    exec: (): void => void begin(index),
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
    exec: (): void => void begin(progress().current),
  },
  {
    id: "trainerNext",
    display: "Trainer: next lesson",
    icon,
    available: (): boolean =>
      notDuringTest() && progress().unlocked > progress().current,
    exec: (): void => void begin(progress().current + 1),
  },
  {
    id: "trainerChoose",
    display: "Trainer: choose lesson...",
    icon,
    available: notDuringTest,
    subgroup: lessonList,
  },
  {
    id: "trainerStop",
    display: "Trainer: stop",
    icon,
    available: (): boolean => notDuringTest() && getActiveLesson() !== null,
    exec: (): void => {
      stopLesson();
      void TestLogic.restart();
    },
  },
  {
    id: "trainerResetKeyStats",
    display: "Trainer: reset key stats",
    icon,
    available: notDuringTest,
    exec: (): void => {
      resetKeyStats();
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
