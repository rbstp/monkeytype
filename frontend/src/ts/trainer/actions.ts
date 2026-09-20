import { navigate } from "../controllers/route-controller";
import { getActivePage } from "../states/core";
import { showNoticeNotification } from "../states/notifications";
import * as TestLogic from "../test/test-logic";
import { startDrill } from "./drill";
import { unlockedUpTo } from "./lessons";
import { startLesson } from "./session";

async function showTest(): Promise<void> {
  if (getActivePage() === "test") {
    await TestLogic.restart();
  } else {
    await navigate("/");
  }
}

/** Shared by the trainer page and the commandline, so the unlock gate lives once. */
export async function beginLesson(index: number): Promise<boolean> {
  if (unlockedUpTo() < index) {
    showNoticeNotification("Pass the previous lesson first.");
    return false;
  }
  if (!(await startLesson(index))) return false;
  await showTest();
  return true;
}

export async function beginDrill(): Promise<boolean> {
  if (!(await startDrill())) return false;
  await showTest();
  return true;
}
