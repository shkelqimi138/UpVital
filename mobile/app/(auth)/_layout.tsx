// Expo Router layout for the auth stack (login, signup, forgot-password)
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
