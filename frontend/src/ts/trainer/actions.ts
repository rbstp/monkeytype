import { navigate } from "../controllers/route-controller";
import { getActivePage } from "../states/core";
import { showNoticeNotification } from "../states/notifications";
import * as TestLogic from "../test/test-logic";
import { unlockedUpTo } from "./lessons";
import { startLesson } from "./session";

/** Shared by the trainer page and the commandline, so the unlock gate lives once. */
export async function beginLesson(index: number): Promise<boolean> {
  if (unlockedUpTo() < index) {
    showNoticeNotification("Pass the previous lesson first.");
    return false;
  }
  if (!(await startLesson(index))) return false;
  if (getActivePage() === "test") {
    await TestLogic.restart();
  } else {
    await navigate("/");
  }
  return true;
}
