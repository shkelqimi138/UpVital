// Profile → Units: how weight, height, energy and temperature are shown and entered. Saved on
// this device; everything is still stored metric, so switching back shows the original numbers.
import { ActionSheetIOS } from "react-native";
import { Hint, ProfilePage } from "../../components/profile/form";
import { SettingsGroup, SettingsRow } from "../../components/ui/SettingsGroup";
import { setPreference, usePreferences } from "../../lib/preferences";
import type { Preferences } from "../../lib/preferences-core";

type UnitKey = keyof Preferences;

const UNIT_ROWS: { key: UnitKey; title: string; options: { value: string; label: string }[] }[] = [
  {
    key: "weight",
    title: "Weight",
    options: [
      { value: "kg", label: "Kilograms" },
      { value: "lb", label: "Pounds" },
    ],
  },
  {
    key: "height",
    title: "Height",
    options: [
      { value: "cm", label: "Centimetres" },
      { value: "ftin", label: "Feet and inches" },
    ],
  },
  {
    key: "energy",
    title: "Energy",
    options: [
      { value: "kcal", label: "Kilocalories" },
      { value: "kJ", label: "Kilojoules" },
    ],
  },
  {
    key: "temperature",
    title: "Temperature",
    options: [
      { value: "C", label: "Celsius" },
      { value: "F", label: "Fahrenheit" },
    ],
  },
];

export default function UnitsScreen() {
  const prefs = usePreferences();

  // The native iOS menu, like the system's own pickers.
  function choose(row: (typeof UNIT_ROWS)[number]) {
    const labels = row.options.map((o) => o.label);
    ActionSheetIOS.showActionSheetWithOptions(
      { title: row.title, options: [...labels, "Cancel"], cancelButtonIndex: labels.length },
      (index) => {
        const picked = row.options[index];
        if (picked) setPreference(row.key, picked.value as Preferences[UnitKey]);
      },
    );
  }

  return (
    <ProfilePage>
      <SettingsGroup title="Units of measurement" inset={false}>
        {UNIT_ROWS.map((row) => (
          <SettingsRow
            key={row.key}
            title={row.title}
            value={row.options.find((o) => o.value === prefs[row.key])?.label}
            accessory="none"
            onPress={() => choose(row)}
            accessibilityHint="Double-tap to change"
          />
        ))}
      </SettingsGroup>
      <Hint>Only changes how values are shown and entered — your data stays the same.</Hint>
    </ProfilePage>
  );
}
