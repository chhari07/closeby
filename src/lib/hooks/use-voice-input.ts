"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

export type VoiceLanguage = "en-IN" | "hi-IN";

/** Longest one recording can run — enough to read out a full monthly list. */
const MAX_LISTEN_MS = 3 * 60_000;
/** Stop by itself after this much silence (counted from the start if nothing was said yet). */
const SILENCE_STOP_MS = 12_000;
/** Pause before re-opening the mic after the browser ends a session, so restarts don't hammer it. */
const RESTART_DELAY_MS = 250;

/** What went wrong, in words the user can act on (status === "error"). */
function describeError(code: string): string {
  switch (code) {
    case "network":
      return "Voice typing needs an internet connection. (It also doesn't work in Brave — use Chrome or Edge.)";
    case "audio-capture":
      return "No microphone found. Plug one in or check it isn't used by another app.";
    case "language-not-supported":
      return "This browser can't recognise that language — try the other one.";
    case "service-not-allowed":
      return "Voice typing is turned off in this browser.";
    default:
      return "Voice typing stopped unexpectedly — tap the mic to try again.";
  }
}

/**
 * Joins a session's final results into one transcript. Desktop Chrome sends
 * each phrase once; Android Chrome in continuous mode re-sends the whole
 * sentence so far as each new final result ("rice", "rice 5kg", "rice 5kg
 * 60"), which plain appending would turn into "rice rice 5kg rice 5kg 60".
 */
export function joinFinals(finals: string[]): string {
  let text = "";
  for (const raw of finals) {
    const part = raw.trim();
    if (!part) continue;
    if (part.toLowerCase().startsWith(text.toLowerCase())) text = part; // cumulative repeat
    else if (!text.toLowerCase().endsWith(part.toLowerCase())) text = `${text} ${part}`.trim();
  }
  return text;
}

export const VOICE_LANGUAGES: { value: VoiceLanguage; label: string }[] = [
  { value: "en-IN", label: "English / Hinglish" },
  { value: "hi-IN", label: "हिन्दी" },
];

/**
 * Mic-to-text for the AI cart's voice-note option (Step 4). Browser-native
 * Web Speech API — no audio ever leaves the device to one of our servers;
 * only the transcript text does, same as if the buyer had typed it. Chrome/
 * Edge/Brave/most Android WebViews support it; Firefox and Safari mostly
 * don't — `status` becomes "unsupported" there and the caller should just
 * leave typing as the only option.
 *
 * Listens in continuous mode so pauses between items ("dal... chawal...
 * aur cheeni") don't end the recording. Browsers still end a session on
 * their own after a while, so it silently restarts until the buyer taps
 * stop, stays quiet for SILENCE_STOP_MS, or MAX_LISTEN_MS runs out.
 */
export function useVoiceInput(language: VoiceLanguage) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef<(text: string) => void>(() => {});
  /** True while the buyer wants the mic on — lets onend tell our stop from the browser's. */
  const wantListeningRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported =
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) setStatus("unsupported");
  }, [supported]);

  // Stop and release the recognizer if the component unmounts mid-listen.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (onFinal: (text: string) => void) => {
      if (!supported) {
        setStatus("unsupported");
        return;
      }
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) {
        setStatus("unsupported");
        return;
      }

      // A second tap while a recording is still winding down must not leave two recognizers running.
      recognitionRef.current?.abort();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      onFinalRef.current = onFinal;
      wantListeningRef.current = true;
      setErrorMessage("");
      const startedAt = Date.now();
      let lastSpeechAt = startedAt;

      const finish = () => {
        wantListeningRef.current = false;
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
        recognitionRef.current?.stop();
      };

      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = setInterval(() => {
        const now = Date.now();
        if (now - startedAt > MAX_LISTEN_MS || now - lastSpeechAt > SILENCE_STOP_MS) finish();
      }, 1000);

      const listen = () => {
        /** How much of this session's transcript was already handed to onFinal. */
        let sent = "";
        const recognition = new Ctor();
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => setStatus("listening");

        recognition.onresult = (event) => {
          if (recognitionRef.current !== recognition) return; // a replaced recognizer's late event
          // Rebuild from ALL results each time (not just from resultIndex):
          // that's the only way to spot Android's cumulative repeats.
          const finals: string[] = [];
          let interim = "";
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i]!;
            if (result.isFinal) finals.push(result[0]?.transcript ?? "");
            else interim += result[0]?.transcript ?? "";
          }
          lastSpeechAt = Date.now();
          const full = joinFinals(finals);
          // Hand over only what's new since the last call; if the browser
          // rewrote earlier words, send nothing rather than a duplicate.
          const fresh = full.toLowerCase().startsWith(sent.toLowerCase()) ? full.slice(sent.length).trim() : "";
          if (full.length > sent.length) sent = full;
          const pending = interim.trim();
          setInterimTranscript(pending && !full.toLowerCase().endsWith(pending.toLowerCase()) ? pending : "");
          if (fresh) onFinalRef.current(fresh);
        };

        recognition.onerror = (event) => {
          if (recognitionRef.current !== recognition) return;
          // "no-speech"/"aborted" just mean a quiet stretch or our own
          // restart — keep going; anything else ends the recording.
          if (event.error === "no-speech" || event.error === "aborted") return;
          wantListeningRef.current = false;
          const denied = event.error === "not-allowed" || event.error === "permission-denied";
          setErrorMessage(denied ? "" : describeError(event.error));
          setStatus(denied ? "denied" : "error");
        };

        recognition.onend = () => {
          if (recognitionRef.current !== recognition) return;
          setInterimTranscript("");
          if (wantListeningRef.current && Date.now() - startedAt < MAX_LISTEN_MS) {
            // The browser ended the session on its own — pick up where it left off.
            restartTimerRef.current = setTimeout(() => {
              restartTimerRef.current = null;
              if (wantListeningRef.current) listen();
              else setStatus((prev) => (prev === "listening" ? "idle" : prev)); // stopped by the silence timer mid-gap
            }, RESTART_DELAY_MS);
            return;
          }
          wantListeningRef.current = false;
          if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
          silenceTimerRef.current = null;
          setStatus((prev) => (prev === "listening" ? "idle" : prev));
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          wantListeningRef.current = false;
          if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
          setErrorMessage(describeError("start-failed"));
          setStatus("error");
        }
      };

      listen();
    },
    [language, supported],
  );

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = null;
    if (restartTimerRef.current) {
      // Stopped between two sessions: no onend is coming, so settle the status here.
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      setStatus((prev) => (prev === "listening" ? "idle" : prev));
    }
    recognitionRef.current?.stop();
  }, []);

  return { status, interimTranscript, errorMessage, start, stop, supported };
}
