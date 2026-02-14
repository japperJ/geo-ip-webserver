import React, { useState } from 'react';

interface GDPRConsentModalProps {
  isOpen: boolean;
  onConsent: () => void;
  onDeny: () => void;
  type?: 'gps' | 'cookies' | 'analytics';
}

export function GDPRConsentModal({ 
  isOpen, 
  onConsent, 
  onDeny,
  type = 'gps'
}: GDPRConsentModalProps) {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  const getContent = () => {
    switch (type) {
      case 'gps':
        return {
          title: 'Location Access Required',
          description: (
            <>
              <p>This site requires your precise location (GPS coordinates) to verify access.</p>
              <p className="mt-2">We will:</p>
              <ul className="list-disc ml-6 mt-2 space-y-1">
                <li>Collect your GPS coordinates when you access the site</li>
                <li>Store this data for audit purposes (90 days)</li>
                <li>Verify your location against our geofence boundaries</li>
              </ul>
              <p className="mt-2">You can withdraw consent and delete your data at any time.</p>
            </>
          )
        };
      case 'cookies':
        return {
          title: 'Cookie Notice',
          description: (
            <>
              <p>We use cookies for authentication (refresh tokens).</p>
              <p className="mt-2">See our privacy policy for more details.</p>
            </>
          )
        };
      default:
        return {
          title: 'Data Collection Notice',
          description: <p>We collect data as described in our privacy policy.</p>
        };
    }
  };

  const content = getContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-2xl font-bold mb-4">{content.title}</h2>
        
        <div className="text-gray-700 text-sm mb-6">
          {content.description}
        </div>

        <div className="mb-6">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              I consent to collection and storage of my {type === 'gps' ? 'GPS coordinates' : 'data'} as described above
            </span>
          </label>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onConsent}
            disabled={!agreed}
            className={`flex-1 px-4 py-2 rounded font-medium ${
              agreed
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Allow Access
          </button>
          <button
            onClick={onDeny}
            className="flex-1 px-4 py-2 rounded font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Deny
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 text-center">
          <a href="/privacy-policy" target="_blank" className="underline hover:text-gray-700">
            View Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}

// Hook for managing GPS consent
export function useGPSConsent() {
  const [showModal, setShowModal] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);

  const requestConsent = (): Promise<boolean> => {
    return new Promise((resolve) => {
      setShowModal(true);

      const handleConsent = () => {
        setConsentGranted(true);
        setShowModal(false);
        
        // Record consent via API
        const sessionId = getOrCreateSessionId();
        fetch('/api/gdpr/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentType: 'gps',
            granted: true,
            sessionId
          })
        }).catch(console.error);

        resolve(true);
      };

      const handleDeny = () => {
        setConsentGranted(false);
        setShowModal(false);
        resolve(false);
      };

      // Attach handlers temporarily
      (window as any).__gpsConsentHandlers = { handleConsent, handleDeny };
    });
  };

  return {
    showModal,
    consentGranted,
    requestConsent,
    ConsentModal: ({ onConsent, onDeny }: { onConsent: () => void; onDeny: () => void }) => (
      <GDPRConsentModal
        isOpen={showModal}
        onConsent={onConsent}
        onDeny={onDeny}
        type="gps"
      />
    )
  };
}

// Helper to get or create session ID
function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem('gdpr_session_id');
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('gdpr_session_id', sessionId);
  }
  return sessionId;
}
