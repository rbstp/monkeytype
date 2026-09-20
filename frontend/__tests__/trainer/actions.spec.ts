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
import { beginLesson } from "../../src/ts/trainer/actions";
import {
  progress,
  replaceProgress,
  resetProgress,
} from "../../src/ts/trainer/lessons";
import * as Session from "../../src/ts/trainer/session";

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
    replaceProgress({ ...progress(), unlocked: 2 });
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
});
