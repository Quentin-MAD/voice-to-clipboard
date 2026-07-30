// Resilient microphone acquisition.
// Chromium throws OverconstrainedError with an EMPTY message when the saved
// deviceId no longer exists (mic unplugged, default device changed, Electron
// device ids rotating between sessions). That produced blank error toasts,
// so we retry without the device constraint and always return readable text.

const BASE: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  const raw = err instanceof Error ? err.message : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Accès au microphone refusé. Autorisez le micro puis réessayez.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Aucun microphone détecté.";
    case "NotReadableError":
    case "TrackStartError":
      return "Micro déjà utilisé par une autre application.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "Le microphone sélectionné est introuvable. Choisissez-en un autre dans les paramètres.";
    default:
      return raw || `Impossible d'ouvrir le microphone${name ? ` (${name})` : ""}.`;
  }
}

/**
 * Opens the mic, falling back to the system default when the stored deviceId
 * is no longer valid. Returns the stream plus the deviceId actually used.
 */
export async function acquireMicStream(
  micDeviceId?: string,
): Promise<{ stream: MediaStream; usedFallback: boolean }> {
  if (micDeviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...BASE, deviceId: { exact: micDeviceId } },
      });
      return { stream, usedFallback: false };
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      // Permission problems must not be masked by a retry.
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
    }
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: BASE });
  return { stream, usedFallback: Boolean(micDeviceId) };
}
