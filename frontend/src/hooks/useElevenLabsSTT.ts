'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface ElevenLabsSTTConfig {
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onDebug?: (message: string) => void;
  languageCode?: string;
  modelId?: string;
}

export interface ElevenLabsSTTState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  transcript: string;
  interimTranscript: string;
}

export interface ElevenLabsSTTResult extends ElevenLabsSTTState {
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
  sendAudioChunk: (pcmData: ArrayBuffer) => void;
}

const ELEVENLABS_STT_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

export function useElevenLabsSTT(config: ElevenLabsSTTConfig = {}): ElevenLabsSTTResult {
  const { 
    onTranscript, 
    onError,
    onDebug,
    languageCode = 'en',
    modelId = 'scribe_v2_realtime'
  } = config;

  const [state, setState] = useState<ElevenLabsSTTState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    transcript: '',
    interimTranscript: '',
  });

  const wsRef = useRef<WebSocket | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const debug = useCallback((msg: string) => {
    console.log(`[STT] ${msg}`);
    onDebug?.(msg);
  }, [onDebug]);

  const cleanup = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const connect = useCallback(async (token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      debug('Already connected');
      return;
    }

    cleanup();
    setState(prev => ({ ...prev, isConnecting: true, error: null, transcript: '', interimTranscript: '' }));

    try {
      const params = new URLSearchParams({
        model_id: modelId,
        token: token,
        language_code: languageCode,
        audio_format: 'pcm_16000',
        commit_strategy: 'vad', // Use VAD for automatic commit
      });
      
      const wsUrl = `${ELEVENLABS_STT_URL}?${params.toString()}`;
      debug(`Connecting to WebSocket...`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        debug('WebSocket opened, waiting for session_started...');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          debug(`Received: ${data.message_type || 'unknown'}`);

          switch (data.message_type) {
            case 'session_started':
              debug(`Session started: ${data.session_id}`);
              setState(prev => ({ 
                ...prev, 
                isConnected: true, 
                isConnecting: false,
                error: null 
              }));

              // Keep-alive every 10 seconds
              keepAliveIntervalRef.current = setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  // Send empty audio chunk as keep-alive
                  wsRef.current.send(JSON.stringify({
                    message_type: 'input_audio_chunk',
                    audio_base_64: '',
                    commit: false,
                  }));
                  debug('Keep-alive sent');
                }
              }, 10000);
              break;

            case 'partial_transcript':
              const partialText = data.text || '';
              debug(`Partial: "${partialText}"`);
              setState(prev => ({
                ...prev,
                interimTranscript: partialText,
              }));
              onTranscript?.(partialText, false);
              break;

            case 'committed_transcript':
            case 'committed_transcript_with_timestamps':
              const finalText = data.text || '';
              debug(`Final: "${finalText}"`);
              setState(prev => ({
                ...prev,
                transcript: prev.transcript + (prev.transcript && finalText ? ' ' : '') + finalText,
                interimTranscript: '',
              }));
              onTranscript?.(finalText, true);
              break;

            default:
              if (data.message_type?.includes('error')) {
                const errorMsg = data.error || data.message || `Error: ${data.message_type}`;
                debug(`Error message: ${errorMsg}`);
                setState(prev => ({ ...prev, error: errorMsg }));
                onError?.(errorMsg);
              } else {
                debug(`Other message: ${JSON.stringify(data)}`);
              }
          }
        } catch (e) {
          debug(`Non-JSON message: ${event.data}`);
        }
      };

      ws.onerror = (event) => {
        debug('WebSocket error occurred');
        const errorMsg = 'WebSocket connection error';
        setState(prev => ({ 
          ...prev, 
          error: errorMsg,
          isConnecting: false,
          isConnected: false,
        }));
        onError?.(errorMsg);
      };

      ws.onclose = (event) => {
        debug(`WebSocket closed: code=${event.code}, reason="${event.reason}"`);
        setState(prev => ({ 
          ...prev, 
          isConnected: false,
          isConnecting: false 
        }));
        
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
          keepAliveIntervalRef.current = null;
        }
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect';
      debug(`Connection error: ${errorMsg}`);
      setState(prev => ({ 
        ...prev, 
        error: errorMsg,
        isConnecting: false 
      }));
      onError?.(errorMsg);
    }
  }, [languageCode, modelId, onTranscript, onError, cleanup, debug]);

  const disconnect = useCallback(() => {
    debug('Disconnecting...');
    cleanup();
    setState(prev => ({ 
      ...prev, 
      isConnected: false,
      isConnecting: false 
    }));
  }, [cleanup, debug]);

  const sendAudioChunk = useCallback((pcmData: ArrayBuffer) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert ArrayBuffer to base64
    const uint8Array = new Uint8Array(pcmData);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    const message = {
      message_type: 'input_audio_chunk',
      audio_base_64: base64,
      commit: false,  // VAD will auto-commit when it detects speech end
      sample_rate: 16000,
    };

    wsRef.current.send(JSON.stringify(message));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendAudioChunk,
  };
}
