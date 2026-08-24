import { drivableEvidenceIntakeSchema } from "../../../shared/drivableEvidence";

export type BuyerEvidenceDraftFields = {
  year: string;
  make: string;
  model: string;
  vin: string;
  mileage: string;
  askingPrice: string;
  listingUrl: string;
  sellerClaims: string;
  buyerObservations: string;
  obdCodes: string;
};

function splitEvidenceLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : undefined;
}

function normalizeObdCodes(value: string) {
  return value.split(/[\s,]+/).map((code) => code.trim().toUpperCase()).filter(Boolean);
}

export function buildBuyerEvidenceDraft(fields: BuyerEvidenceDraftFields) {
  return drivableEvidenceIntakeSchema.safeParse({
    mode: "buy",
    vehicle: {
      year: fields.year.trim(),
      make: fields.make.trim(),
      model: fields.model.trim(),
      vin: fields.vin.trim() || undefined,
      mileage: optionalNumber(fields.mileage),
    },
    situation: {
      buyerObservations: splitEvidenceLines(fields.buyerObservations),
      sellerClaims: splitEvidenceLines(fields.sellerClaims),
      askingPrice: optionalNumber(fields.askingPrice),
      listingUrl: fields.listingUrl.trim() || undefined,
    },
    obd: { codes: normalizeObdCodes(fields.obdCodes), attachmentIds: [] },
    attachments: [],
  });
}
