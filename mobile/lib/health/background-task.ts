import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { finishHistoryImport, syncNow } from "./sync";

// Fallback / safety net. Push-based HealthKit delivery (enableHealthBackgroundDelivery in
// sync.ts, via the library's configureBackgroundTypes) is the primary mechanism now — it wakes
// the app much closer to when new data lands. This periodic, OS-scheduled task still runs
// roughly every few hours as a backstop for anything the push path misses (e.g. a device where
// background delivery is throttled or the observer wasn't re-registered on a cold wake).
export const HEALTH_SYNC_TASK = "upvital-health-sync";

if (!TaskManager.isTaskDefined(HEALTH_SYNC_TASK)) {
  TaskManager.defineTask(HEALTH_SYNC_TASK, async () => {
    try {
      await syncNow();
      // Wait for any older history still importing: iOS freezes the app as soon as this task
      // returns, so a fire-and-forget import would barely move in the background. HealthKit
      // can't be read while the phone is locked, so this only helps when iOS runs the task with
      // the phone unlocked; otherwise the import simply continues the next time the app is open.
      await finishHistoryImport();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerHealthBackgroundTask(): Promise<void> {
  await BackgroundTask.registerTaskAsync(HEALTH_SYNC_TASK, { minimumInterval: 180 });
}
