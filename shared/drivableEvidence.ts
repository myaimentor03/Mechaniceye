import { z } from "zod";

export const evidenceModes = ["diagnose", "buy", "sell"] as const;
export const evidenceKinds = [
  "photo", "audio", "video", "document", "obd_screenshot", "sensor_session",
] as const;
export const evidenceProvenance = [
  "customer_observation", "buyer_observation", "seller_claim",
  "uploaded_media", "obd_scan", "official_context",
] as const;

const optionalText = z.string().trim().max(4_000).optional();

export const vehicleIdentitySchema = z.object({
  year: z.string().trim().max(4).optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  trim: z.string().trim().max(120).optional(),
  engine: z.string().trim().max(120).optional(),
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional(),
  mileage: z.number().int().nonnegative().nullable().optional(),
  transmission: z.string().trim().max(80).optional(),
  drivetrain: z.string().trim().max(80).optional(),
});

export const evidenceAttachmentSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  kind: z.enum(evidenceKinds),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
  status: z.enum(["persisted", "rejected", "deleted"]),
  serverAttachmentId: z.string().min(1),
  storageKey: z.string().min(1),
  createdAt: z.string().datetime(),
  provenance: z.enum(evidenceProvenance),
  analysisStatus: z.enum(["uploaded_not_analyzed", "analyzed"]),
  notes: optionalText,
});

export const obdEvidenceSchema = z.object({
  codes: z.array(z.string().trim().toUpperCase().regex(/^[PBCU][0-9A-F]{4}$/)).max(30).default([]),
  notes: optionalText,
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
});

export const situationEvidenceSchema = z.object({
  description: optionalText,
  symptoms: z.array(z.string().trim().max(500)).max(50).default([]),
  timing: optionalText,
  urgency: optionalText,
  canDrive: optionalText,
  recentRepairs: optionalText,
  buyerObservations: z.array(z.string().trim().max(1_000)).max(50).default([]),
  sellerClaims: z.array(z.string().trim().max(1_000)).max(50).default([]),
  askingPrice: z.number().nonnegative().nullable().optional(),
  titleClaim: optionalText,
  listingUrl: z.string().url().max(2_000).optional(),
});

export const drivableEvidenceIntakeSchema = z.object({
  mode: z.enum(evidenceModes).default("diagnose"),
  vehicle: vehicleIdentitySchema.default({}),
  situation: situationEvidenceSchema.default({ symptoms: [], buyerObservations: [], sellerClaims: [] }),
  obd: obdEvidenceSchema.default({ codes: [], attachmentIds: [] }),
  attachments: z.array(evidenceAttachmentSchema).max(50).default([]),
});

export type EvidenceMode = (typeof evidenceModes)[number];
export type VehicleIdentity = z.infer<typeof vehicleIdentitySchema>;
export type EvidenceAttachment = z.infer<typeof evidenceAttachmentSchema>;
export type ObdEvidence = z.infer<typeof obdEvidenceSchema>;
export type SituationEvidence = z.infer<typeof situationEvidenceSchema>;
export type DrivableEvidenceIntake = z.infer<typeof drivableEvidenceIntakeSchema>;
