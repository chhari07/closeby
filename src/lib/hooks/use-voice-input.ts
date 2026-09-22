"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputStatus = "idle" | "listening" | "unsupported" | "denied" | "error";

export type VoiceLanguage = "en-IN" | "hi-IN";

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
 */
export function useVoiceInput(language: VoiceLanguage) {
  const [status, setStatus] = useState<VoiceInputStatus>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef<(text: string) => void>(() => {});

  const supported =
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) setStatus("unsupported");
  }, [supported]);

  // Stop and release the recognizer if the component unmounts mid-listen.
  useEffect(() => {
    return () => {
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

      onFinalRef.current = onFinal;
      const recognition = new Ctor();
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setStatus("listening");

      recognition.onresult = (event) => {
        let finalText = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!;
          if (result.isFinal) finalText += result[0]?.transcript ?? "";
          else interim += result[0]?.transcript ?? "";
        }
        setInterimTranscript(interim);
        if (finalText.trim()) onFinalRef.current(finalText.trim());
      };

      recognition.onerror = (event) => {
        setStatus(event.error === "not-allowed" || event.error === "permission-denied" ? "denied" : "error");
      };

      recognition.onend = () => {
        setStatus((prev) => (prev === "listening" ? "idle" : prev));
        setInterimTranscript("");
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        setStatus("error");
      }
    },
    [language, supported],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { status, interimTranscript, start, stop, supported };
}
