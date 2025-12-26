'use client';

import { useState, useCallback } from 'react';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useElevenLabsSTT } from '@/hooks/useElevenLabsSTT';
import { MicrophoneSelector } from '@/components/MicrophoneSelector';
import { Waveform } from '@/components/Waveform';

export default function Home() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>();
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDebugLogs(prev => [...prev.slice(-19), `${time} ${msg}`]);
  }, []);

  const {
    isConnected: sttConnected,
    isConnecting: sttConnecting,
    transcript,
    interimTranscript,
    error: sttError,
    connect: connectSTT,
    disconnect: disconnectSTT,
    sendAudioChunk,
  } = useElevenLabsSTT({
    languageCode: 'en',
    modelId: 'scribe_v2_realtime',
    onTranscript: (text, isFinal) => {
      addLog(`${isFinal ? '✓' : '~'} "${text}"`);
    },
    onError: (err) => {
      addLog(`❌ ${err}`);
      setError(err);
    },
    onDebug: addLog,
  });

  const handleAudioChunk = useCallback((chunk: ArrayBuffer) => {
    sendAudioChunk(chunk);
  }, [sendAudioChunk]);

  const {
    isRecording,
    isSupported,
    error: audioError,
    audioLevel,
    startRecording,
    stopRecording,
  } = useAudioCapture({
    sampleRate: 16000,
    channelCount: 1,
    timeslice: 100,
    onAudioChunk: handleAudioChunk,
    deviceId: selectedMicId,
  });

  const handleRecordClick = async () => {
    if (isRecording) {
      addLog('Stopping...');
      await stopRecording();
      disconnectSTT();
    } else {
      setLoading(true);
      setError(null);
      setDebugLogs([]);

      try {
        addLog('Fetching token...');
        const response = await fetch('http://localhost:8000/token');
        if (!response.ok) {
          throw new Error(`Token failed: ${response.status}`);
        }
        const data = await response.json();
        addLog('Token OK');

        await connectSTT(data.token);
        await startRecording();
        addLog('Mic started');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed';
        setError(msg);
        addLog(`❌ ${msg}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const displayError = error || audioError || sttError;

  return (
    <main className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Main content - centered vertically */}
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="w-full max-w-2xl px-8">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-medium text-white tracking-tight mb-2">
              Feynman Auditor
            </h1>
            <p className="text-[#666]">
              Explain your thinking, get instant feedback
            </p>
          </div>

          {/* Mic selector */}
          <div className="h-10 flex items-center justify-center mb-6">
            {!isRecording && (
              <MicrophoneSelector 
                onDeviceChange={setSelectedMicId}
                currentDeviceId={selectedMicId}
              />
            )}
          </div>

          {/* Waveform */}
          <div className="h-12 mb-6">
            <Waveform audioLevel={audioLevel} isActive={isRecording} />
          </div>

          {/* Button */}
          <div className="flex justify-center mb-6">
            <button
              onClick={handleRecordClick}
              disabled={loading || !isSupported}
              className={`
                px-12 py-4 text-base font-medium rounded-full
                transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isRecording
                  ? 'bg-white/10 text-white border border-white/20 hover:bg-white/15'
                  : 'bg-white text-black hover:bg-gray-100'
                }
              `}
            >
              {loading ? 'Connecting...' : isRecording ? 'Stop' : 'Start Recording'}
            </button>
          </div>

          {/* Status */}
          <div className="h-5 flex justify-center mb-6">
            {isRecording && (
              <span className={`text-sm ${sttConnected ? 'text-green-400' : 'text-[#666]'}`}>
                {sttConnecting ? 'Connecting...' : sttConnected ? 'Connected' : 'Disconnected'}
              </span>
            )}
          </div>

          {/* Transcript */}
          <div className="min-h-[100px] mb-6">
            {(transcript || interimTranscript) ? (
              <div className="p-5 bg-[#111] border border-[#222] rounded-xl">
                {transcript && (
                  <p className="text-white text-lg leading-relaxed">{transcript}</p>
                )}
                {interimTranscript && (
                  <p className="text-[#666] text-lg">{interimTranscript}</p>
                )}
              </div>
            ) : isRecording ? (
              <div className="p-5 text-center">
                <p className="text-[#444] text-sm">Listening...</p>
              </div>
            ) : null}
          </div>

          {/* Error */}
          {displayError && (
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl mb-6">
              <p className="text-red-400 text-sm">{displayError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Debug footer - fixed at bottom */}
      <div className="px-8 pb-6">
        <div className="max-w-2xl mx-auto text-center">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="text-[#333] text-xs hover:text-[#555] mb-3"
          >
            {showDebug ? 'Hide logs' : 'Show logs'}
          </button>
          
          {showDebug && (
            <div className="p-3 bg-[#0D0D0D] border border-[#1A1A1A] rounded-lg text-left max-h-40 overflow-y-auto">
              {debugLogs.length === 0 ? (
                <p className="text-[#333] text-xs font-mono">No logs yet</p>
              ) : (
                debugLogs.map((log, i) => (
                  <div key={i} className="text-[#444] text-xs font-mono">{log}</div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
