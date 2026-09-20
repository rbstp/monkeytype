import { navigate } from "../../controllers/route-controller";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { isTestActive } from "../../states/test";
import * as TestLogic from "../../test/test-logic";
import { beginLesson } from "../../trainer/actions";
import { exportBackup, importBackup } from "../../trainer/backup";
import { resetKeyStats } from "../../trainer/key-stats";
import { LESSONS, progress, resetProgress } from "../../trainer/lessons";
import { getActiveLesson, stopLesson } from "../../trainer/session";
import { Command, CommandsSubgroup } from "../types";

const icon = "fa-graduation-cap";

const notDuringTest = (): boolean => !isTestActive();

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
    exec: (): void => void beginLesson(progress().current),
  },
  {
    id: "trainerNext",
    display: "Trainer: next lesson",
    icon,
    available: (): boolean =>
      notDuringTest() && progress().unlocked > progress().current,
    exec: (): void => void beginLesson(progress().current + 1),
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
    id: "trainerExport",
    display: "Trainer: export data",
    alias: "backup",
    icon,
    input: true,
    available: notDuringTest,
    defaultValue: exportBackup,
  },
  {
    id: "trainerImport",
    display: "Trainer: import data",
    alias: "restore backup",
    icon,
    input: true,
    available: notDuringTest,
    exec: ({ input }): void => {
      if (input === undefined || input === "") return;
      if (importBackup(input)) {
        showSuccessNotification("Trainer data imported");
      } else {
        showErrorNotification("Invalid trainer data");
      }
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
