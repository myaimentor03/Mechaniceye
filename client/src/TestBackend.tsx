import { useState } from "react";

const API_BASE = "https://mechaniceye-backend-v2.onrender.com";

export default function TestBackend() {
  const [description, setDescription] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [timing, setTiming] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitDiagnosis(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/diagnoses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          description,
          vehicleInfo,
          timing
        })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold mb-3">Mechanic's Eye</h1>
        <p className="text-lg text-gray-700 mb-8">
          Submit your vehicle issue for diagnosis.
        </p>

        <form onSubmit={submitDiagnosis} className="space-y-5 border rounded-2xl p-6 shadow-sm">
          <div>
            <label className="block text-sm font-semibold mb-2">Vehicle information</label>
            <input
              type="text"
              value={vehicleInfo}
              onChange={(e) => setVehicleInfo(e.target.value)}
              placeholder="Example: 2014 Ford Escape 1.6L"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">When does it happen?</label>
            <input
              type="text"
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
              placeholder="Example: only at idle, during acceleration, after warming up"
              className="w-full border rounded-lg px-4 py-3"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Describe the problem</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the noise, symptoms, warning lights, recent repairs, smells, leaks, or anything else helpful."
              rows={8}
              className="w-full border rounded-lg px-4 py-3"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-lg border font-semibold"
          >
            {loading ? "Submitting..." : "Submit Diagnosis"}
          </button>
        </form>

        {error && (
          <div className="mt-6 border border-red-300 bg-red-50 text-red-700 rounded-xl p-4 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 border border-green-300 bg-green-50 rounded-xl p-5">
            <h2 className="text-xl font-bold mb-3">Submission Received</h2>
            <p className="mb-2"><strong>Status:</strong> {result.status}</p>
            <p className="mb-2"><strong>ID:</strong> {result.id}</p>
            <p className="mb-2"><strong>Description:</strong> {result.description}</p>
            <p className="mb-2"><strong>Vehicle Info:</strong> {result.vehicleInfo || "N/A"}</p>
            <p className="mb-2"><strong>Timing:</strong> {result.timing || "N/A"}</p>
            <p className="text-sm text-gray-600 mt-3">
              Your request was successfully sent to the Mechanic’s Eye backend.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
