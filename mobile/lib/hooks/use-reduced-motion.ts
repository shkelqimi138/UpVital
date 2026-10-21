import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Tracks the OS "Reduce Motion" accessibility setting (Settings → Accessibility → Motion).
// Looping/decorative animations should hold still when this is on (WCAG 2.3.3). Reads the
// current value on mount and stays in sync via the change event.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
