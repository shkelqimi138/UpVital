// Profile → Daily insight time: the hour (the phone's local time) the daily AI insight is written
// and sent. It covers last night's sleep, so the server waits up to 3 hours for that to sync.
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { Hint, ProfilePage } from "../../components/profile/form";
import { SettingsGroup, SettingsRow } from "../../components/ui/SettingsGroup";
import { friendlyMessage } from "../../lib/api/client";
import { getProfile, updateProfile } from "../../lib/api/profile";
import { formatHour } from "../../lib/format-time";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export default function InsightTimeScreen() {
  const [selected, setSelected] = useState<number | null>(null);
  const [aiOn, setAiOn] = useState(true);
  // One save at a time: overlapping saves could finish out of order and leave the server on a
  // different hour than the one ticked here.
  const saving = useRef(false);

  useEffect(() => {
    getProfile()
      .then((profile) => {
        setSelected(profile.insightHour);
        setAiOn(profile.aiConsent);
      })
      .catch(() => {});
  }, []);

  async function choose(hour: number) {
    if (saving.current || hour === selected) return;
    saving.current = true;
    const previous = selected;
    setSelected(hour); // optimistic
    try {
      await updateProfile({ insightHour: hour });
    } catch (err) {
      setSelected(previous); // revert on failure
      Alert.alert("Couldn't save the time", friendlyMessage(err));
    } finally {
      saving.current = false;
    }
  }

  return (
    <ProfilePage>
      <Hint>
        Your daily insight is written at this time and sent as a notification. It covers last night's sleep,
        so if that hasn't reached UpVital yet (apps like Fitbit sync it later), it waits up to 3 hours.
      </Hint>
      {!aiOn && (
        <Hint>AI insights & Coach is off, so no insight is written. You can turn it on in Profile.</Hint>
      )}
      <SettingsGroup inset={false}>
        {HOURS.map((hour) => (
          <SettingsRow
            key={hour}
            title={formatHour(hour)}
            accessory={hour === selected ? "check" : "none"}
            onPress={() => choose(hour)}
          />
        ))}
      </SettingsGroup>
    </ProfilePage>
  );
}
