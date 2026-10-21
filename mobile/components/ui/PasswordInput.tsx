// Password field with a show/hide toggle
import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInput as TextInputType,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import { Icon } from "./Icon";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "style"> & {
  /** The screen's own input style (glass on auth, themed elsewhere). */
  inputStyle: StyleProp<TextStyle>;
  /** Colour for the show/hide eye glyph, so it fits each screen's palette. */
  eyeColor: string;
};

// A secure text field with a show/hide eye. The eye is a 44×44 target (Apple's minimum),
// hidden from nothing — it carries an accessibilityLabel that flips with state. Everything
// else passes straight through to TextInput, so callers keep their AutoFill / return-key props.
export const PasswordInput = forwardRef<TextInputType, PasswordInputProps>(
  ({ inputStyle, eyeColor, ...rest }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <View style={styles.wrap}>
        <TextInput ref={ref} secureTextEntry={!show} style={[inputStyle, styles.input]} {...rest} />
        <Pressable
          style={styles.eye}
          hitSlop={6}
          onPress={() => setShow((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
        >
          <Icon name={show ? "eyeOff" : "eye"} size={20} color={eyeColor} />
        </Pressable>
      </View>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

const styles = StyleSheet.create({
  wrap: { position: "relative", justifyContent: "center" },
  // Keep typed characters clear of the eye.
  input: { paddingRight: 48 },
  eye: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
