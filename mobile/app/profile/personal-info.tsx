// Profile → Personal info: display name, birthdate (for biological age), latest weight (read-only,
// it comes from Apple Health) and height — weight and height in the user's chosen units.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Field,
  FormCard,
  FormMessage,
  PrimaryButton,
  ProfilePage,
  ReadOnlyRow,
} from "../../components/profile/form";
import { LoadError } from "../../components/ui/LoadError";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { friendlyMessage } from "../../lib/api/client";
import { usePreferences } from "../../lib/preferences";
import { getProfile, updateProfile } from "../../lib/api/profile";
import { validatePersonalInfo } from "../../lib/profile-validation";
import { spacing } from "../../lib/theme";
import { cmToFeetInches, feetInchesToCm, fromDisplayWeight, toDisplayWeight } from "../../lib/units";
import { getWeightEntries, type WeightEntry } from "../../lib/api/weight";

/** What's typed in the height field(s) → cm (null when empty, NaN when it isn't a valid height). */
function typedHeightCm(unit: "cm" | "ftin", cm: string, feet: string, inches: string): number | null {
  if (unit === "cm") return cm ? Number(cm) : null;
  if (!feet && !inches) return null;
  const ft = Number(feet || 0);
  const inch = Number(inches || 0);
  if (!Number.isInteger(ft) || !Number.isInteger(inch) || ft < 0 || inch < 0 || inch > 11) return Number.NaN;
  return feetInchesToCm(ft, inch);
}

export default function PersonalInfoScreen() {
  const { weight: weightUnit, height: heightUnit } = usePreferences();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdateInput] = useState("");
  const [heightCmInput, setHeightCmInput] = useState("");
  const [feetInput, setFeetInput] = useState("");
  const [inchesInput, setInchesInput] = useState("");
  const [latestWeight, setLatestWeight] = useState<WeightEntry | null>(null);
  // Stored height and how it was first shown: if the field(s) are left untouched the stored cm is
  // saved as-is, so cm → ft/in → cm rounding can't nudge it (181 cm would come back as 180).
  const [loadedHeight, setLoadedHeight] = useState<{ cm: number | null; shown: string }>({
    cm: null,
    shown: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useAnnouncedState(screenActive);
  const [error, setError] = useAnnouncedState(screenActive);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const profile = await getProfile();
      if (profile.displayName) setDisplayName(profile.displayName);
      if (profile.birthdate) setBirthdateInput(profile.birthdate);
      if (profile.heightCm) {
        setHeightCmInput(String(profile.heightCm));
        const { feet, inches } = cmToFeetInches(profile.heightCm);
        setFeetInput(String(feet));
        setInchesInput(String(inches));
        setLoadedHeight({ cm: profile.heightCm, shown: `${profile.heightCm}|${feet}|${inches}` });
      }
    } catch {
      // A failed load leaves the form blank. Saving from a blank form would send explicit nulls,
      // silently wiping the user's stored values — so record it and refuse to save until reloaded.
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    getWeightEntries()
      .then((entries) => setLatestWeight(entries[0] ?? null))
      .catch(() => {});
  }, [load]);

  async function handleSave() {
    setError(null);
    setSaved(null);
    if (loadFailed) {
      setError(
        "We couldn't load your profile, so saving is turned off — otherwise these blank fields would overwrite what you already have. Use Try again to reload it.",
      );
      return;
    }
    const untouched =
      loadedHeight.cm !== null && `${heightCmInput}|${feetInput}|${inchesInput}` === loadedHeight.shown;
    const heightCm = untouched
      ? loadedHeight.cm
      : typedHeightCm(heightUnit, heightCmInput, feetInput, inchesInput);
    const invalid = validatePersonalInfo({ displayName, birthdate, heightCm, heightUnit });
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || null,
        birthdate: birthdate || null,
        heightCm,
      });
      setSaved("Saved");
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Weight entries are stored in kg (older ones may carry "lb"); show them in the chosen unit.
  let weightDisplay = "—";
  if (latestWeight) {
    const kg = latestWeight.unit === "lb" ? fromDisplayWeight(latestWeight.value, "lb") : latestWeight.value;
    weightDisplay = `${toDisplayWeight(kg, weightUnit)} ${weightUnit}`;
  }

  return (
    <ProfilePage>
      {loadFailed && (
        <LoadError
          what="your profile"
          message="Your details aren't shown because we couldn't reach the server — they're still saved. Saving is off until this loads, so the blank fields can't overwrite them."
          onRetry={() => void load()}
        />
      )}
      <FormCard>
        <Field
          label="Display name"
          placeholder="e.g. Alex Martin"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Field
          label="Birthdate (for biological age)"
          placeholder="YYYY-MM-DD"
          value={birthdate}
          onChangeText={setBirthdateInput}
        />
        <ReadOnlyRow label="Weight (latest logged)" value={weightDisplay} />
        {heightUnit === "cm" ? (
          <Field
            label="Height (cm)"
            placeholder="e.g. 178"
            keyboardType="number-pad"
            value={heightCmInput}
            onChangeText={setHeightCmInput}
          />
        ) : (
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field
                label="Height (ft)"
                placeholder="e.g. 5"
                keyboardType="number-pad"
                value={feetInput}
                onChangeText={setFeetInput}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="(in)"
                accessibilityLabel="Height, inches"
                placeholder="e.g. 10"
                keyboardType="number-pad"
                value={inchesInput}
                onChangeText={setInchesInput}
              />
            </View>
          </View>
        )}
      </FormCard>
      <PrimaryButton label="Save" onPress={handleSave} busy={saving} disabled={loadFailed} />
      <FormMessage success={saved} error={error} />
    </ProfilePage>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: spacing.md },
});
