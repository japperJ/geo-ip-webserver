import { useState } from 'react';

function App() {
  const [status, setStatus] = useState<string>('');

  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      setStatus(JSON.stringify(data, null, 2));
    } catch (error) {
      setStatus(`Error: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Geo-IP Webserver Admin</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Backend Status</h2>
          
          <button
            onClick={checkHealth}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Check Backend Health
          </button>
          
          {status && (
            <pre className="mt-4 bg-gray-900 p-4 rounded overflow-x-auto">
              {status}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
