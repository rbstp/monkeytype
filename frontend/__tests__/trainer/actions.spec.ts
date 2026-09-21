import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockInstance,
  vi,
} from "vitest";
import * as RouteController from "../../src/ts/controllers/route-controller";
import * as Core from "../../src/ts/states/core";
import * as Notifications from "../../src/ts/states/notifications";
import * as TestLogic from "../../src/ts/test/test-logic";
import {
  backupFilename,
  beginDrill,
  beginLesson,
  exportBackupFile,
  importBackupFile,
} from "../../src/ts/trainer/actions";
import * as Drill from "../../src/ts/trainer/drill";
import {
  currentLesson,
  replaceProgress,
  resetProgress,
  setCurrentLesson,
} from "../../src/ts/trainer/lessons";
import * as Session from "../../src/ts/trainer/session";
import * as Misc from "../../src/ts/utils/misc";

vi.mock("../../src/ts/controllers/route-controller", () => ({
  navigate: vi.fn(),
}));
vi.mock("../../src/ts/test/test-logic", () => ({
  restart: vi.fn(),
}));

describe("trainer actions", () => {
  const restartMock = vi.mocked(TestLogic.restart);
  const navigateMock = vi.mocked(RouteController.navigate);
  let startLessonMock: MockInstance<typeof Session.startLesson>;
  let activePageMock: MockInstance<typeof Core.getActivePage>;
  let noticeMock: MockInstance<typeof Notifications.showNoticeNotification>;

  beforeEach(() => {
    resetProgress();
    replaceProgress({
      version: 3,
      layouts: { qwerty: { current: "home-row", unlocked: "r-u", best: {} } },
      attempts: [],
    });
    restartMock.mockReset().mockResolvedValue();
    navigateMock.mockReset().mockResolvedValue();
    startLessonMock = vi.spyOn(Session, "startLesson").mockResolvedValue(true);
    activePageMock = vi.spyOn(Core, "getActivePage").mockReturnValue("test");
    noticeMock = vi
      .spyOn(Notifications, "showNoticeNotification")
      .mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses a locked lesson and starts nothing", async () => {
    expect(await beginLesson(3)).toBe(false);
    expect(noticeMock).toHaveBeenCalledWith("Pass the previous lesson first.");
    expect(startLessonMock).not.toHaveBeenCalled();
    expect(restartMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("restarts in place on the test page", async () => {
    expect(await beginLesson(2)).toBe(true);
    expect(startLessonMock).toHaveBeenCalledWith(2);
    expect(restartMock).toHaveBeenCalledTimes(1);
    expect(restartMock).toHaveBeenCalledWith();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it("navigates home from another page", async () => {
    activePageMock.mockReturnValue("trainer");
    expect(await beginLesson(1)).toBe(true);
    expect(startLessonMock).toHaveBeenCalledWith(1);
    expect(navigateMock).toHaveBeenCalledWith("/");
    expect(restartMock).not.toHaveBeenCalled();
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it("stops when the lesson does not start", async () => {
    startLessonMock.mockResolvedValue(false);
    expect(await beginLesson(1)).toBe(false);
    expect(restartMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(noticeMock).not.toHaveBeenCalled();
  });

  it("begins a drill through the same restart path", async () => {
    const startDrillMock = vi
      .spyOn(Drill, "startDrill")
      .mockResolvedValue(true);
    expect(await beginDrill()).toBe(true);
    expect(startDrillMock).toHaveBeenCalledTimes(1);
    expect(restartMock).toHaveBeenCalledTimes(1);

    activePageMock.mockReturnValue("trainer");
    expect(await beginDrill()).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith("/");

    startDrillMock.mockResolvedValue(false);
    expect(await beginDrill()).toBe(false);
    expect(restartMock).toHaveBeenCalledTimes(1);
  });

  describe("files", () => {
    const readBlob = async (blob: Blob): Promise<string> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === "string" ? reader.result : "");
        reader.readAsText(blob);
      });

    it("names the backup by the local date", () => {
      expect(backupFilename(new Date(2026, 8, 20, 23, 59))).toBe(
        "trainer-backup-2026-09-20.json",
      );
      expect(backupFilename(new Date(2026, 0, 1, 0, 0))).toBe(
        "trainer-backup-2026-01-01.json",
      );
    });

    it("reports a file that cannot be read", async () => {
      const errorMock = vi
        .spyOn(Notifications, "showErrorNotification")
        .mockReturnValue(0);
      class FailingReader {
        onerror: (() => void) | null = null;
        readAsText(): void {
          queueMicrotask(() => this.onerror?.());
        }
      }
      vi.stubGlobal("FileReader", FailingReader);
      try {
        expect(
          await importBackupFile(
            new File(["{}"], "b.json", { type: "application/json" }),
          ),
        ).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
      expect(errorMock).toHaveBeenCalledWith("Failed to read file");
    });

    it("downloads the backup as a json file", async () => {
      const downloadMock = vi
        .spyOn(Misc, "download")
        .mockImplementation(() => undefined);
      setCurrentLesson(1);
      exportBackupFile();
      expect(downloadMock).toHaveBeenCalledTimes(1);
      const { filename, data } = downloadMock.mock.calls[0]?.[0] as {
        filename: string;
        data: Blob;
      };
      expect(filename).toMatch(/^trainer-backup-\d{4}-\d{2}-\d{2}\.json$/);
      expect(data.type).toBe("application/json");
      const parsed = JSON.parse(await readBlob(data)) as {
        version: number;
        progress: { layouts: Record<string, { current: string }> };
      };
      expect(parsed.version).toBe(4);
      expect(parsed.progress.layouts["qwerty"]?.current).toBe("e-i");
    });

    it("imports a json file and reports the result", async () => {
      const successMock = vi
        .spyOn(Notifications, "showSuccessNotification")
        .mockReturnValue(0);
      const errorMock = vi
        .spyOn(Notifications, "showErrorNotification")
        .mockReturnValue(0);
      const backup = JSON.stringify({
        version: 1,
        keyStats: { version: 2, layouts: {} },
        progress: { version: 1, current: 4, unlocked: 5, attempts: [] },
      });

      expect(
        await importBackupFile(
          new File([backup], "notes.txt", { type: "text/plain" }),
        ),
      ).toBe(false);
      expect(errorMock).toHaveBeenCalledWith("File is not a JSON file");
      expect(currentLesson()).toBe(0);

      expect(
        await importBackupFile(new File(["nope"], "backup.json", { type: "" })),
      ).toBe(false);
      expect(errorMock).toHaveBeenCalledWith("Invalid trainer data");

      expect(
        await importBackupFile(
          new File([backup], "b.json", { type: "application/json" }),
        ),
      ).toBe(true);
      expect(successMock).toHaveBeenCalledWith("Trainer data imported");
      expect(currentLesson()).toBe(4);
    });
  });
});
