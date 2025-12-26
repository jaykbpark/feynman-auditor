'use client';

import { useState, useEffect } from 'react';

interface MicrophoneSelectorProps {
  onDeviceChange: (deviceId: string) => void;
  currentDeviceId?: string;
}

export function MicrophoneSelector({ onDeviceChange, currentDeviceId }: MicrophoneSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    async function getDevices() {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Get all audio input devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter(device => device.kind === 'audioinput');
        setDevices(audioInputs);
      } catch (err) {
        console.error('Error getting audio devices:', err);
      }
    }

    getDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);

  const currentDevice = devices.find(d => d.deviceId === currentDeviceId) || devices[0];

  if (devices.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <span className="max-w-[200px] truncate">
          {currentDevice?.label || 'Default Microphone'}
        </span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full mt-2 left-0 right-0 bg-[#1A1A1A] border border-white/10 rounded-lg shadow-2xl z-20 overflow-hidden">
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={() => {
                  onDeviceChange(device.deviceId);
                  setIsOpen(false);
                }}
                className={`
                  w-full px-4 py-3 text-left text-sm transition-colors
                  ${device.deviceId === currentDeviceId 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  {device.deviceId === currentDeviceId && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="truncate">
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

