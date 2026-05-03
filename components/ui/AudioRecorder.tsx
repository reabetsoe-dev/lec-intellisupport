"use client";

import React, { useEffect, useRef, useState } from 'react';
import { transcribeAudioClip } from '@/lib/api';

type BrowserSpeechRecognitionResultItem = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  isFinal: boolean;
  0: BrowserSpeechRecognitionResultItem;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: BrowserSpeechRecognitionResult[];
};

type BrowserSpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

interface AudioRecorderProps {
  onTranscript?: (transcript: string) => void;
  className?: string;
}

function getMicrophoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission was denied or dismissed. Click the lock icon in your browser and allow microphone access.";
  }

  if (name === "NotFoundError") {
    return "No microphone was detected. Connect a microphone and try again.";
  }

  if (name === "NotReadableError") {
    return "Your microphone is currently unavailable. Close other apps using it and try again.";
  }

  return "Unable to start recording right now. Please try again.";
}

function fileExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return ".webm";
  }
  if (mimeType.includes("wav")) {
    return ".wav";
  }
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return ".mp3";
  }
  if (mimeType.includes("ogg")) {
    return ".ogg";
  }
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return ".m4a";
  }
  return ".webm";
}

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onTranscript, className = "" }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [browserTranscript, setBrowserTranscript] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>("audio/webm");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const stopSpeechRecognition = () => {
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
  };

  const startSpeechRecognition = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let nextTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          nextTranscript += event.results[index]?.[0]?.transcript ?? "";
        }
        const normalizedTranscript = nextTranscript.trim();
        if (normalizedTranscript) {
          setBrowserTranscript(normalizedTranscript);
        }
      };
      recognition.onerror = () => {
        stopSpeechRecognition();
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopSpeechRecognition();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      return;
    }

    try {
      setError("");
      setTranscript("");
      setBrowserTranscript("");
      setAudioBlob(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recordingMimeTypeRef.current = mediaRecorder.mimeType || "audio/webm";
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const mimeType = recordingMimeTypeRef.current || audioChunksRef.current[0]?.type || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      startSpeechRecognition();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (err) {
      stopSpeechRecognition();
      setError(getMicrophoneErrorMessage(err));

      // Permission denial/dismissal is an expected user action and should not
      // surface as a development console error overlay.
      const name = err instanceof DOMException ? err.name : "";
      const isExpectedPermissionFlow = name === "NotAllowedError" || name === "SecurityError";
      if (!isExpectedPermissionFlow) {
        console.error("Unexpected microphone error:", err);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      stopSpeechRecognition();
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const transcribeAudio = async () => {
    if (!audioBlob) return;
    
    setIsProcessing(true);
    setError("");
    
    try {
      const transcriptFromBrowser = browserTranscript.trim();
      if (transcriptFromBrowser) {
        setTranscript(transcriptFromBrowser);
        if (onTranscript) {
          onTranscript(transcriptFromBrowser);
        }
        return;
      }

      const extension = fileExtensionFromMimeType(audioBlob.type);
      const payload = await transcribeAudioClip({
        audio: audioBlob,
        filename: `voice-note${extension}`,
      });

      const transcriptText = payload.transcript;
      setTranscript(transcriptText);
      if (onTranscript) {
        onTranscript(transcriptText);
      }
    } catch (err) {
      const nextMessage = err instanceof Error ? err.message : "Failed to transcribe audio. Please try again.";
      setError(nextMessage);
      console.error("Transcription error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetRecording = () => {
    stopSpeechRecognition();
    setAudioBlob(null);
    setTranscript("");
    setBrowserTranscript("");
    setError("");
    setRecordingTime(0);
  };

  return (
    <div className={`audio-recorder ${className}`}>
      <div className="flex flex-col space-y-4">
        {/* Recording controls */}
        <div className="flex items-center space-x-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Start Recording</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
              </svg>
              <span>Stop Recording</span>
            </button>
          )}
          
          {audioBlob && !isProcessing && (
            <button
              onClick={transcribeAudio}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" clipRule="evenodd" />
              </svg>
              <span>Transcribe</span>
            </button>
          )}
          
          {(audioBlob || transcript) && (
            <button
              onClick={resetRecording}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              <span>Reset</span>
            </button>
          )}
        </div>
        
        {/* Recording status */}
        {isRecording && (
          <div className="flex items-center space-x-2 text-red-500">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span>Recording... {formatTime(recordingTime)}</span>
          </div>
        )}

        {isRecording && browserTranscript && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Live transcript: {browserTranscript}
          </div>
        )}
        
        {/* Processing status */}
        {isProcessing && (
          <div className="flex items-center space-x-2 text-blue-500">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            <span>Transcribing audio...</span>
          </div>
        )}
        
        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        {/* Transcript display */}
        {transcript && (
          <div className="p-4 bg-gray-100 rounded-lg">
            <h3 className="font-semibold text-gray-700 mb-2">Transcript:</h3>
            <p className="text-gray-800 whitespace-pre-wrap">{transcript}</p>
          </div>
        )}
        
        {/* Audio preview */}
        {audioBlob && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-700 mb-2">Audio Preview:</h3>
            <audio controls className="w-full">
              <source src={URL.createObjectURL(audioBlob)} type={audioBlob.type || "audio/webm"} />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
