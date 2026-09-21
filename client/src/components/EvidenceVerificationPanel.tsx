import { useState, useEffect, useRef } from "react";

interface EvidenceAttachment {
  id: string;
  kind: "photo" | "audio" | "video" | "sensor_session" | "document" | "obd_screenshot";
  originalName: string;
  mimeType: string;
  byteSize: number;
  status: string;
  createdAt: string;
}

interface EvidenceSummary {
  photos: { count: number; status: string };
  audio: { count: number; status: string };
  video: { count: number; status: string };
  vibration: { count: number; status: string };
}

interface EvidenceVerificationData {
  ok: boolean;
  caseId: string;
  evidenceSummary: EvidenceSummary;
  attachments: EvidenceAttachment[];
}

interface EvidenceVerificationPanelProps {
  caseId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "stored" ? "#9af0c5" : status === "not_provided" ? "#6b7a8d" : "#ffd27d";
  return (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6 }} />
  );
}

function PhotoGrid({ attachments, caseId }: { attachments: EvidenceAttachment[]; caseId: string }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
      {attachments.map((att) => (
        <figure key={att.id} style={{ margin: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--card2)" }}>
          <img
            src={`/api/cases/${caseId}/evidence/${att.id}`}
            alt={att.originalName}
            style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
            loading="lazy"
          />
          <figcaption style={{ padding: "4px 8px", fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {att.originalName}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function AudioList({ attachments, caseId }: { attachments: EvidenceAttachment[]; caseId: string }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {attachments.map((att) => (
        <div key={att.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", background: "var(--card2)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: 4 }}>{att.originalName} ({formatBytes(att.byteSize)})</div>
          <audio controls style={{ width: "100%", height: 32 }}>
            <source src={`/api/cases/${caseId}/evidence/${att.id}`} type={att.mimeType} />
            Your browser does not support audio playback.
          </audio>
        </div>
      ))}
    </div>
  );
}

function VideoList({ attachments, caseId }: { attachments: EvidenceAttachment[]; caseId: string }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {attachments.map((att) => (
        <div key={att.id} style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--card2)" }}>
          <div style={{ padding: "6px 12px", fontSize: "0.75rem", color: "var(--muted)" }}>{att.originalName} ({formatBytes(att.byteSize)})</div>
          <video controls style={{ width: "100%", maxHeight: 240, display: "block" }}>
            <source src={`/api/cases/${caseId}/evidence/${att.id}`} type={att.mimeType} />
            Your browser does not support video playback.
          </video>
        </div>
      ))}
    </div>
  );
}

function VibrationSummary({ attachments }: { attachments: EvidenceAttachment[] }) {
  if (attachments.length === 0) return null;
  const totalReadings = attachments.length;
  const totalSize = attachments.reduce((sum, a) => sum + a.byteSize, 0);
  return (
    <div style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", background: "var(--card2)" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--text)" }}>
        {totalReadings} vibration {totalReadings === 1 ? "session" : "sessions"} captured ({formatBytes(totalSize)} total)
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 4 }}>
        Motion data stored as JSON. Not yet analyzed.
      </div>
    </div>
  );
}

export function EvidenceVerificationPanel({ caseId }: EvidenceVerificationPanelProps) {
  const [data, setData] = useState<EvidenceVerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cases/${caseId}/evidence`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((err) => { if (!cancelled) setError(err.message || "Could not load evidence."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [caseId]);

  if (loading) {
    return (
      <div className="section-block" style={{ opacity: 0.7 }}>
        <h3>Evidence Stored</h3>
        <div className="upload-note">Loading evidence status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-block">
        <h3>Evidence Stored</h3>
        <div className="upload-note">{error}</div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="section-block">
        <h3>Evidence Stored</h3>
        <div className="upload-note">Evidence status unavailable for this case.</div>
      </div>
    );
  }

  const { evidenceSummary, attachments } = data;
  const photos = attachments.filter((a) => a.kind === "photo");
  const audio = attachments.filter((a) => a.kind === "audio");
  const video = attachments.filter((a) => a.kind === "video");
  const vibration = attachments.filter((a) => a.kind === "sensor_session");
  const totalFiles = photos.length + audio.length + video.length + vibration.length;

  if (totalFiles === 0) {
    return (
      <div className="section-block">
        <h3>Evidence Status</h3>
        <div className="upload-note">No evidence files were submitted with this case. You can describe the issue in words or add evidence later via follow-up.</div>
      </div>
    );
  }

  return (
    <div className="section-block">
      <h3>Evidence Stored</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 12 }}>
        {totalFiles} file{totalFiles !== 1 ? "s" : ""} stored with your case. Uploaded media is stored for human review and is not analyzed automatically.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem", color: "var(--text)" }}>
          <StatusDot status={evidenceSummary.photos.status} />
          Photos: {evidenceSummary.photos.count}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem", color: "var(--text)" }}>
          <StatusDot status={evidenceSummary.audio.status} />
          Audio: {evidenceSummary.audio.count}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem", color: "var(--text)" }}>
          <StatusDot status={evidenceSummary.video.status} />
          Video: {evidenceSummary.video.count}
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem", color: "var(--text)" }}>
          <StatusDot status={evidenceSummary.vibration.status} />
          Vibration: {evidenceSummary.vibration.count}
        </div>
      </div>

      {photos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: 4 }}>Photos</h4>
          <PhotoGrid attachments={photos} caseId={caseId} />
        </div>
      )}

      {audio.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: 4 }}>Audio</h4>
          <AudioList attachments={audio} caseId={caseId} />
        </div>
      )}

      {video.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: 4 }}>Video</h4>
          <VideoList attachments={video} caseId={caseId} />
        </div>
      )}

      {vibration.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: "0.85rem", color: "var(--text)", marginBottom: 4 }}>Vibration / Motion</h4>
          <VibrationSummary attachments={vibration} />
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--muted)" }}>
        Case ID: {caseId} | Evidence is stored privately and shared only with authorized reviewers.
      </div>
    </div>
  );
}
