'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioCaptureConfig {
  sampleRate?: number;     // Target sample rate (default: 16000 for ElevenLabs)
  channelCount?: number;   // Number of channels (default: 1 for mono)
  onAudioChunk?: (chunk: ArrayBuffer) => void;  // Callback for streaming chunks
  timeslice?: number;      // How often to emit chunks in ms (default: 250)
  deviceId?: string;       // Specific microphone device ID
}

export interface AudioCaptureState {
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  audioLevel: number;      // 0-1 representing current audio level
}

export interface AudioCaptureResult extends AudioCaptureState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  getAudioBlob: () => Blob | null;
}

/**
 * Custom hook for capturing audio from the microphone
 * Outputs PCM 16-bit audio suitable for ElevenLabs WebSocket streaming
 * 
 * ElevenLabs supported formats:
 * - PCM (S16LE): 16kHz-44.1kHz, 16-bit
 * - Opus: 48kHz
 * - MP3: 22.05kHz or 44.1kHz
 */
export function useAudioCapture(config: AudioCaptureConfig = {}): AudioCaptureResult {
  const {
    sampleRate = 16000,
    channelCount = 1,
    onAudioChunk,
    timeslice = 250,
    deviceId,
  } = config;

  const [state, setState] = useState<AudioCaptureState>({
    isRecording: false,
    isSupported: true, // Will be checked on mount
    error: null,
    audioLevel: 0,
  });

  // Check browser support on mount (client-side only)
  useEffect(() => {
    const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    setState(prev => ({ ...prev, isSupported: supported }));
  }, []);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Update audio level visualization - runs continuously when recording
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      return;
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray); // Use time domain for better voice response

    // Calculate peak level from time domain data
    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = Math.abs(dataArray[i] - 128); // Center is 128
      if (val > maxVal) maxVal = val;
    }
    
    // Normalize to 0-1 with some amplification for better visibility
    const normalizedLevel = Math.min((maxVal / 128) * 1.5, 1);

    setState(prev => ({ ...prev, audioLevel: normalizedLevel }));
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  /**
   * Convert Float32Array audio samples to Int16 PCM
   */
  const floatTo16BitPCM = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp the value between -1 and 1
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
    }
    
    return buffer;
  };

  /**
   * Downsample audio to target sample rate
   */
  const downsampleBuffer = (
    buffer: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): Float32Array => {
    if (inputSampleRate === outputSampleRate) {
      return buffer;
    }
    
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.floor(i * sampleRateRatio);
      result[i] = buffer[srcIndex];
    }
    
    return result;
  };

  const startRecording = useCallback(async () => {
    if (state.isRecording) return;

    try {
      setState(prev => ({ ...prev, error: null }));
      audioChunksRef.current = [];

      // Request microphone access with specific constraints
      const audioConstraints: MediaTrackConstraints = {
        channelCount,
        sampleRate: { ideal: 48000 }, // Request high sample rate, we'll downsample
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      // Add device ID if specified
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      mediaStreamRef.current = stream;

      // Create AudioContext for processing
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);

      // Create analyser for level visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // If we need to stream PCM chunks
      if (onAudioChunk) {
        const bufferSize = 4096;
        const scriptProcessor = audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
        scriptProcessorRef.current = scriptProcessor;

        scriptProcessor.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          
          // Downsample to target sample rate
          const downsampled = downsampleBuffer(
            inputBuffer,
            audioContext.sampleRate,
            sampleRate
          );
          
          // Convert to 16-bit PCM
          const pcmData = floatTo16BitPCM(downsampled);
          
          // Call the chunk callback
          onAudioChunk(pcmData);
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
      }

      // Also use MediaRecorder for getting a complete blob at the end
      // Try to use a format that's widely supported
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(timeslice);
      
      setState(prev => ({ ...prev, isRecording: true }));
      
      // Start audio level visualization
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      
      console.log('[AudioCapture] Recording started', {
        sampleRate: audioContext.sampleRate,
        targetSampleRate: sampleRate,
        mimeType,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access microphone';
      setState(prev => ({ ...prev, error: errorMessage }));
      console.error('[AudioCapture] Error:', err);
      cleanup();
    }
  }, [state.isRecording, channelCount, sampleRate, timeslice, onAudioChunk, cleanup, updateAudioLevel]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (!state.isRecording || !mediaRecorderRef.current) {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      
      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        console.log('[AudioCapture] Recording stopped', {
          chunks: audioChunksRef.current.length,
          size: audioBlob.size,
          type: mimeType,
        });

        cleanup();
        setState(prev => ({ ...prev, isRecording: false, audioLevel: 0 }));
        resolve(audioBlob);
      };

      mediaRecorder.stop();
    });
  }, [state.isRecording, cleanup]);

  const getAudioBlob = useCallback((): Blob | null => {
    if (audioChunksRef.current.length === 0) return null;
    
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    return new Blob(audioChunksRef.current, { type: mimeType });
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    getAudioBlob,
  };
}


