import { useIsFocused } from "expo-router";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { createAnnouncer } from "../announcer";

// Speaks a message to VoiceOver, queued after whatever it is already saying (e.g. the field focus
// just moved to) instead of cutting it off. Needed because `accessibilityLiveRegion` does nothing
// on iOS (it's Android-only), so a message that merely appears on screen is silent there. Pass
// `active = false` when its screen isn't on display; see announcer.ts for the de-duplication.
export const announce = createAnnouncer((message) =>
  AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true }),
);

// Whether the calling screen is the one on display — false once the user moves to another tab or
// screen, or it unmounts. A ref, so callbacks that finish late read the current value. Uses the
// navigation focus state, so call it from inside a route — once per screen, then pass it to each
// `useAnnouncedState`.
export function useScreenActiveRef(): RefObject<boolean> {
  const isFocused = useIsFocused();
  const activeRef = useRef(isFocused);
  useEffect(() => {
    activeRef.current = isFocused;
    return () => {
      activeRef.current = false;
    };
  }, [isFocused]);
  return activeRef;
}

// `useState` for an inline form message (error or success) that is also spoken every time it is
// set. Announcing on set rather than on render means a retry that produces the same message is
// spoken again — React skips the re-render when the value doesn't change. A message set after the
// user has left the screen (e.g. a save that finished late) is shown but not spoken over the
// screen they're on now.
export function useAnnouncedState(
  screenActive: RefObject<boolean>,
): [string | null, (next: string | null) => void] {
  const [value, setValue] = useState<string | null>(null);
  const set = useCallback(
    (next: string | null) => {
      setValue(next);
      announce(next, screenActive.current);
    },
    [screenActive],
  );
  return [value, set];
}
