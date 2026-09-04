/**
 * Thin wrapper over the browser's built-in speech recognition.
 *
 * This runs entirely in the browser: no audio is uploaded, no extra API is
 * called. It is offered as a convenience for answering aloud, and typing is
 * always available, so a session never depends on it working.
 */
type Recognition = any;

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
}

export function createRecogniser(
  onText: (text: string, isFinal: boolean) => void,
  onEnd: () => void,
  onError: (message: string) => void
): Recognition | null {
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;

  const rec: Recognition = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-IN';

  rec.onresult = (event: any) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += chunk;
      else interim += chunk;
    }
    if (final) onText(final, true);
    else if (interim) onText(interim, false);
  };

  rec.onerror = (e: any) => {
    if (e.error === 'no-speech') return;
    if (e.error === 'not-allowed') {
      onError('Microphone permission was denied. You can type your answer instead.');
    } else {
      onError('Speech input stopped. You can type your answer instead.');
    }
  };

  rec.onend = onEnd;

  return rec;
}
