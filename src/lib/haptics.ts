import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { NATIVE } from "@/lib/native";

let selecting = false;

/** A faint click as a slider passes each step. Does nothing on the web. */
export function tick() {
  if (!NATIVE) return;
  if (!selecting) {
    selecting = true;
    void Haptics.selectionStart();
  }
  void Haptics.selectionChanged();
}

/** A light tap for buttons and switches. Does nothing on the web. */
export function tap() {
  if (NATIVE) void Haptics.impact({ style: ImpactStyle.Light });
}
