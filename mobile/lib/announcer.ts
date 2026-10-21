// The decision part of screen-reader announcements, kept free of React Native so it can be
// unit-tested; `hooks/announce.ts` wires it to VoiceOver.
//
// A message is spoken only when there is one and its screen is the one on display (`active`),
// and an identical message repeated within `windowMs` is dropped — e.g. a field's error spoken as
// the field loses focus and then again by the submit tapped in the same gesture. A deliberate
// retry a moment later is still spoken. A message skipped for an inactive screen doesn't count
// towards that window.
export function createAnnouncer(
  speak: (message: string) => void,
  now: () => number = Date.now,
  windowMs = 1500,
): (message: string | null | undefined, active?: boolean) => boolean {
  let last: { message: string; at: number } | null = null;
  return (message, active = true) => {
    if (!message || !active) return false;
    const at = now();
    if (last && last.message === message && at - last.at < windowMs) return false;
    last = { message, at };
    speak(message);
    return true;
  };
}
