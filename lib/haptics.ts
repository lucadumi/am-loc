import * as Haptics from "expo-haptics";

/** Thin wrapper around expo-haptics so screens don't import it directly. */
export const haptics = {
  selection: () => Haptics.selectionAsync().catch(() => {}),
  success: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {}
    ),
  warning: () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => {}
    ),
};
