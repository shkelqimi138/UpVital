import { ReactElement } from "react";
import { Keyboard, TouchableWithoutFeedback } from "react-native";

/**
 * Wrap a screen's content so tapping anywhere outside a text field dismisses the
 * keyboard. Taps on inputs, buttons and links still work — TouchableWithoutFeedback
 * only catches touches that fall through to the background. `accessible={false}`
 * keeps this gesture helper out of the screen-reader focus order (it's not a control).
 *
 * TouchableWithoutFeedback requires exactly one child element.
 */
export function DismissKeyboard({ children }: { children: ReactElement }) {
  return (
    <TouchableWithoutFeedback accessible={false} onPress={() => Keyboard.dismiss()}>
      {children}
    </TouchableWithoutFeedback>
  );
}
