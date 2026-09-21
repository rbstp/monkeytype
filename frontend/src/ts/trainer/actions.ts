import { createSignal } from "solid-js";
import { navigate } from "../controllers/route-controller";
import { getActivePage } from "../states/core";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../states/notifications";
import * as TestLogic from "../test/test-logic";
import { download } from "../utils/misc";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { startDrill, startReview, startWarmUp } from "./drill";
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

export async function beginWarmUp(): Promise<boolean> {
  if (!(await startWarmUp())) return false;
  await showTest();
  return true;
}

export async function beginReview(): Promise<boolean> {
  if (!(await startReview())) return false;
  await showTest();
  return true;
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `trainer-backup-${date}.json`;
}

export function exportBackupFile(): void {
  download({
    filename: backupFilename(),
    data: new Blob([exportBackup()], { type: "application/json" }),
  });
}

function isJsonFile(file: File): boolean {
  return file.type === "application/json" || file.name.endsWith(".json");
}

export async function importBackupFile(file: File): Promise<boolean> {
  if (!isJsonFile(file)) {
    showErrorNotification("File is not a JSON file");
    return false;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      const json = typeof content === "string" ? content : "";
      if (parseBackup(json) === undefined) {
        showErrorNotification("Invalid trainer data");
        resolve(false);
        return;
      }
      // a refused write raises its own notification, so the data is not blamed
      const imported = importBackup(json);
      if (imported) showSuccessNotification("Trainer data imported");
      resolve(imported);
    };
    reader.onerror = () => {
      showErrorNotification("Failed to read file");
      resolve(false);
    };
    reader.readAsText(file, "UTF-8");
  });
}

const [importRequest, setImportRequest] = createSignal(0);

/** The trainer page listens and opens its file picker. */
export { importRequest };

export function requestImport(): void {
  setImportRequest((count) => count + 1);
}
