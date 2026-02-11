import { useEffect, useRef } from "react";
import { Seconds } from "../domain/choreo";

export function useAudioTransport(
  audioUrl: string | null,
  isPlaying: boolean,
  time: Seconds,
  snippet?: { start: Seconds; end: Seconds }
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    audioRef.current = new Audio(audioUrl);
    audioRef.current.preload = "auto";
    return () => audioRef.current?.pause();
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!snippet) {
      audio.pause();
      return;
    }

    const desiredTime = snippet.start + time;

    if (Math.abs(audio.currentTime - desiredTime) > 0.05) {
      audio.currentTime = desiredTime;
    }

    if (isPlaying) audio.play();
    else audio.pause();

    if (audio.currentTime >= snippet.end) {
      audio.pause();
    }
  }, [time, isPlaying, snippet]);
}