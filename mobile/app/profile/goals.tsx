// Profile → Goals: weight goal + target date, daily steps, nightly sleep, daily active energy —
// weight and energy in the user's chosen units (stored as kg / kcal).
import { useCallback, useEffect, useState } from "react";
import { Field, FormCard, FormMessage, PrimaryButton, ProfilePage } from "../../components/profile/form";
import { LoadError } from "../../components/ui/LoadError";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { friendlyMessage } from "../../lib/api/client";
import { usePreferences } from "../../lib/preferences";
import { getProfile, updateProfile } from "../../lib/api/profile";
import { validateGoals } from "../../lib/profile-validation";
import { fromDisplayEnergy, fromDisplayWeight, toDisplayEnergy, toDisplayWeight } from "../../lib/units";

export default function GoalsScreen() {
  const { weight: weightUnit, energy: energyUnit } = usePreferences();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [weightGoal, setWeightGoal] = useState("");
  const [weightGoalTargetDate, setWeightGoalTargetDate] = useState("");
  const [stepGoal, setStepGoal] = useState("");
  const [sleepGoalHours, setSleepGoalHours] = useState("");
  const [activeEnergyGoal, setActiveEnergyGoal] = useState("");
  // The stored values and how they were first shown: a field left untouched saves its stored
  // value as-is, so converting kg → lb → kg can't nudge it.
  const [loaded, setLoaded] = useState<{
    kg: number | null;
    kgShown: string;
    kcal: number | null;
    kcalShown: string;
    stepsShown: string;
  }>({ kg: null, kgShown: "", kcal: null, kcalShown: "", stepsShown: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useAnnouncedState(screenActive);
  const [error, setError] = useAnnouncedState(screenActive);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const profile = await getProfile();
      const kgShown = profile.weightGoalKg ? String(toDisplayWeight(profile.weightGoalKg, weightUnit)) : "";
      const kcalShown = profile.activeCalorieGoal
        ? String(toDisplayEnergy(profile.activeCalorieGoal, energyUnit))
        : "";
      const stepsShown = profile.stepGoal ? String(profile.stepGoal) : "";
      setLoaded({
        kg: profile.weightGoalKg,
        kgShown,
        kcal: profile.activeCalorieGoal,
        kcalShown,
        stepsShown,
      });
      setWeightGoal(kgShown);
      setActiveEnergyGoal(kcalShown);
      setStepGoal(stepsShown);
      if (profile.weightGoalTargetDate) setWeightGoalTargetDate(profile.weightGoalTargetDate);
      if (profile.sleepGoalHours) setSleepGoalHours(String(profile.sleepGoalHours));
    } catch {
      // A failed load leaves the form blank. Saving from a blank form would send explicit nulls,
      // silently wiping the user's stored values — so record it and refuse to save until reloaded.
      setLoadFailed(true);
    }
  }, [weightUnit, energyUnit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setError(null);
    setSaved(null);
    if (loadFailed) {
      setError(
        "We couldn't load your goals, so saving is turned off — otherwise these blank fields would overwrite what you already have. Use Try again to reload it.",
      );
      return;
    }
    const invalid = validateGoals({
      weightGoal,
      weightUnit,
      weightGoalTargetDate,
      stepGoal,
      stepGoalUnchanged: stepGoal !== "" && stepGoal === loaded.stepsShown,
      sleepGoalHours,
      activeEnergyGoal,
      energyUnit,
    });
    if (invalid) {
      setError(invalid);
      return;
    }
    const weightGoalKg = !weightGoal
      ? null
      : weightGoal === loaded.kgShown
        ? loaded.kg
        : fromDisplayWeight(parseFloat(weightGoal), weightUnit);
    const activeCalorieGoal = !activeEnergyGoal
      ? null
      : activeEnergyGoal === loaded.kcalShown
        ? loaded.kcal
        : fromDisplayEnergy(parseInt(activeEnergyGoal, 10), energyUnit);
    setSaving(true);
    try {
      await updateProfile({
        weightGoalKg,
        weightGoalTargetDate: weightGoalTargetDate || null,
        stepGoal: stepGoal ? parseInt(stepGoal, 10) : null,
        sleepGoalHours: sleepGoalHours ? parseFloat(sleepGoalHours) : null,
        activeCalorieGoal,
      });
      setSaved("Saved");
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfilePage>
      {loadFailed && (
        <LoadError
          what="your goals"
          message="Your goals aren't shown because we couldn't reach the server — they're still saved. Saving is off until this loads, so the blank fields can't overwrite them."
          onRetry={() => void load()}
        />
      )}
      <FormCard title="Weight goal">
        <Field
          label={`Target weight (${weightUnit})`}
          placeholder={weightUnit === "kg" ? "e.g. 75" : "e.g. 165"}
          keyboardType="decimal-pad"
          value={weightGoal}
          onChangeText={setWeightGoal}
        />
        <Field
          label="By which date"
          placeholder="YYYY-MM-DD"
          value={weightGoalTargetDate}
          onChangeText={setWeightGoalTargetDate}
        />
      </FormCard>
      <FormCard title="Daily goals">
        <Field
          label="Daily step goal"
          placeholder="e.g. 10000"
          keyboardType="number-pad"
          value={stepGoal}
          onChangeText={setStepGoal}
        />
        <Field
          label="Nightly sleep goal (hours)"
          placeholder="e.g. 8"
          keyboardType="decimal-pad"
          value={sleepGoalHours}
          onChangeText={setSleepGoalHours}
        />
        <Field
          label={`Daily active-energy goal (${energyUnit})`}
          placeholder={energyUnit === "kcal" ? "e.g. 500" : "e.g. 2000"}
          keyboardType="number-pad"
          value={activeEnergyGoal}
          onChangeText={setActiveEnergyGoal}
        />
      </FormCard>
      <PrimaryButton label="Save" onPress={handleSave} busy={saving} disabled={loadFailed} />
      <FormMessage success={saved} error={error} />
    </ProfilePage>
  );
}
