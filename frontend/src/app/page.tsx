'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRecordClick = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      console.log('Recording stopped...');
    } else {
      // Start recording - fetch token from backend
      setIsRecording(true);
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('http://localhost:8000/token');
        if (!response.ok) {
          throw new Error(`Failed to get token: ${response.statusText}`);
        }
        const data = await response.json();
        setToken(data.token || JSON.stringify(data));
        console.log('Token received:', data);
        console.log('Recording started...');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to get token';
        setError(errorMessage);
        setIsRecording(false);
        console.error('Error:', errorMessage);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Feynman Auditor</h1>
          <p className="text-slate-400">Record your explanation and get feedback</p>
        </div>

        <Button
          onClick={handleRecordClick}
          disabled={loading}
          size="lg"
          className={`px-8 py-6 text-lg font-semibold ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Getting token...' : isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
        </Button>

        {isRecording && (
          <div className="flex justify-center items-center space-x-2">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <p className="text-slate-300">Recording in progress...</p>
          </div>
        )}

        {token && (
          <div className="mt-4 p-4 bg-green-900/20 border border-green-600 rounded-lg">
            <p className="text-green-400 text-sm mb-2">✓ Token received</p>
            <p className="text-slate-300 text-xs break-all font-mono">{token}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-600 rounded-lg">
            <p className="text-red-400 text-sm">✗ Error: {error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
