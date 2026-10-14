import { useVoiceInput } from "./useVoiceInput";

export function VoiceButton() {
  const { isListening, transcript, startListening, stopListening } =
    useVoiceInput();

  return (
    <div>
      <button onClick={isListening ? stopListening : startListening}>
        🎤 {isListening ? "Listening..." : "Start Voice"}
      </button>

      {transcript && (
        <p>
          <strong>You said:</strong> {transcript}
        </p>
      )}
    </div>
  );
}