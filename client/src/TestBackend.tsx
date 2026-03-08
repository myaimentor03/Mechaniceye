import React from "react";

export default function TestBackend() {
  const testBackend = async () => {
    const res = await fetch("https://mechaniceye-backend-v2.onrender.com/api/diagnoses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms: "engine knocking" })
    });

    const data = await res.json();
    alert(JSON.stringify(data, null, 2));
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Backend Connection Test</h2>
      <button onClick={testBackend}>Test Backend</button>
    </div>
  );
}
