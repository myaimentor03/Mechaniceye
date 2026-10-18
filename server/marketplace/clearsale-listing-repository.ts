import { randomUUID } from "node:crypto";
import { z } from "zod";

export const listingStatusSchema = z.enum(["draft", "pending_review", "published", "withdrawn", "rejected"]);
export const storageStatusSchema = z.enum(["not_requested", "persisted", "failed"]);

export const listingInputSchema = z.object({
  sellerName: z.string().trim().min(1).max(200),
  sellerEmail: z.string().trim().email().max(254),
  sellerPhone: z.string().trim().max(40).optional().default(""),
  vehicleYear: z.coerce.number().int().min(1886).max(2100),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  trim: z.string().trim().max(120).optional().default(""),
  vin: z.string().trim().max(32).optional().default(""),
  mileage: z.coerce.number().int().min(0).max(2_000_000),
  askingPriceCents: z.coerce.number().int().min(0).max(100_000_000),
  titleStatus: z.string().trim().min(1).max(80),
  runsAndDrives: z.string().trim().min(1).max(80),
  knownIssues: z.string().trim().min(1).max(10_000),
  recentRepairs: z.string().trim().max(10_000).optional().default(""),
  sellerNotes: z.string().trim().max(10_000).optional().default(""),
});

export type ListingInput = z.infer<typeof listingInputSchema>;
export type ListingStatus = z.infer<typeof listingStatusSchema>;
export type StorageStatus = z.infer<typeof storageStatusSchema>;

export type SellerListing = ListingInput & {
  id: string;
  sellerUserId: string;
  status: ListingStatus;
  storageStatus: StorageStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicListing = {
  id: string;
  vehicleYear: number;
  make: string;
  model: string;
  trim: string;
  mileage: number;
  askingPriceCents: number;
  titleStatus: string;
  runsAndDrives: string;
  knownIssues: string;
  recentRepairs: string;
  sellerNotes: string;
  createdAt: string;
  updatedAt: string;
};

type Queryable = { query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[] }> };

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function sellerRow(row: any): SellerListing {
  return {
    id: row.id, sellerUserId: row.seller_user_id, sellerName: row.seller_name, sellerEmail: row.seller_email,
    sellerPhone: row.seller_phone ?? "", vehicleYear: row.vehicle_year, make: row.make, model: row.model,
    trim: row.trim ?? "", vin: row.vin ?? "", mileage: row.mileage, askingPriceCents: row.asking_price_cents,
    titleStatus: row.title_status, runsAndDrives: row.runs_and_drives, knownIssues: row.known_issues,
    recentRepairs: row.recent_repairs ?? "", sellerNotes: row.seller_notes ?? "", status: row.status,
    storageStatus: row.storage_status, rejectionReason: row.rejection_reason ?? null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

function publicRow(row: any): PublicListing {
  return {
    id: row.id, vehicleYear: row.vehicle_year, make: row.make, model: row.model, trim: row.trim ?? "",
    mileage: row.mileage, askingPriceCents: row.asking_price_cents, titleStatus: row.title_status,
    runsAndDrives: row.runs_and_drives, knownIssues: row.known_issues, recentRepairs: row.recent_repairs ?? "",
    sellerNotes: row.seller_notes ?? "", createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

export class ClearSaleListingRepository {
  constructor(private readonly client: Queryable) {}

  async create(sellerUserId: string, input: ListingInput): Promise<SellerListing> {
    const id = `listing_${randomUUID().replaceAll("-", "")}`;
    const result = await this.client.query(`
      insert into clearsale_listings
      (id, seller_user_id, seller_name, seller_email, seller_phone, vehicle_year, make, model, trim, vin,
       mileage, asking_price_cents, title_status, runs_and_drives, known_issues, recent_repairs, seller_notes)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      returning *`, [id, sellerUserId, input.sellerName, input.sellerEmail, input.sellerPhone, input.vehicleYear,
      input.make, input.model, input.trim, input.vin, input.mileage, input.askingPriceCents, input.titleStatus,
      input.runsAndDrives, input.knownIssues, input.recentRepairs, input.sellerNotes]);
    return sellerRow(result.rows[0]);
  }

  async getOwned(id: string, sellerUserId: string): Promise<SellerListing | null> {
    const result = await this.client.query(`select * from clearsale_listings where id = $1 and seller_user_id = $2`, [id, sellerUserId]);
    return result.rows[0] ? sellerRow(result.rows[0]) : null;
  }

  async listOwned(sellerUserId: string): Promise<SellerListing[]> {
    const result = await this.client.query(`select * from clearsale_listings where seller_user_id = $1 order by updated_at desc`, [sellerUserId]);
    return result.rows.map(sellerRow);
  }

  async updateOwned(id: string, sellerUserId: string, input: ListingInput): Promise<SellerListing | null> {
    const result = await this.client.query(`
      update clearsale_listings set seller_name=$3, seller_email=$4, seller_phone=$5, vehicle_year=$6, make=$7,
      model=$8, trim=$9, vin=$10, mileage=$11, asking_price_cents=$12, title_status=$13, runs_and_drives=$14,
      known_issues=$15, recent_repairs=$16, seller_notes=$17,
      status=case when status='published' then 'pending_review' else status end,
      rejection_reason=null, updated_at=now() where id=$1 and seller_user_id=$2 returning *`,
      [id, sellerUserId, input.sellerName, input.sellerEmail, input.sellerPhone, input.vehicleYear, input.make,
        input.model, input.trim, input.vin, input.mileage, input.askingPriceCents, input.titleStatus,
        input.runsAndDrives, input.knownIssues, input.recentRepairs, input.sellerNotes]);
    return result.rows[0] ? sellerRow(result.rows[0]) : null;
  }

  async submit(id: string, sellerUserId: string): Promise<SellerListing> {
    const result = await this.client.query(`update clearsale_listings set status='pending_review', updated_at=now()
      where id=$1 and seller_user_id=$2 and status in ('draft','rejected','withdrawn') and storage_status <> 'failed' returning *`, [id, sellerUserId]);
    if (!result.rows[0]) throw new Error("Listing is missing, not owned by this seller, or cannot be submitted.");
    return sellerRow(result.rows[0]);
  }

  async withdraw(id: string, sellerUserId: string): Promise<SellerListing> {
    const result = await this.client.query(`update clearsale_listings set status='withdrawn', updated_at=now()
      where id=$1 and seller_user_id=$2 and status <> 'withdrawn' returning *`, [id, sellerUserId]);
    if (!result.rows[0]) throw new Error("Listing is missing or not owned by this seller.");
    return sellerRow(result.rows[0]);
  }

  async approve(id: string, rejectionReason?: string): Promise<SellerListing> {
    const result = await this.client.query(`update clearsale_listings set status='published', rejection_reason=null,
      updated_at=now() where id=$1 and status='pending_review' and storage_status='persisted' returning *`, [id]);
    if (result.rows[0]) return sellerRow(result.rows[0]);
    if (rejectionReason) return this.reject(id, rejectionReason);
    throw new Error("Listing is missing, not pending review, or storage is incomplete.");
  }

  async reject(id: string, reason: string): Promise<SellerListing> {
    const result = await this.client.query(`update clearsale_listings set status='rejected', rejection_reason=$2, updated_at=now()
      where id=$1 and status='pending_review' returning *`, [id, reason]);
    if (!result.rows[0]) throw new Error("Listing is missing or not pending review.");
    return sellerRow(result.rows[0]);
  }

  async markStorageFailure(id: string, reason: string): Promise<void> {
    await this.client.query(`update clearsale_listings set storage_status='failed', status=case when status='published' then 'draft' else status end,
      rejection_reason=$2, updated_at=now() where id=$1`, [id, reason]);
  }

  async listPublic(): Promise<PublicListing[]> {
    const result = await this.client.query(`select id, vehicle_year, make, model, trim, mileage, asking_price_cents,
      title_status, runs_and_drives, known_issues, recent_repairs, seller_notes, created_at, updated_at
      from clearsale_listings where status='published' and storage_status='persisted' order by updated_at desc`);
    return result.rows.map(publicRow);
  }

  async getPublic(id: string): Promise<PublicListing | null> {
    const result = await this.client.query(`select id, vehicle_year, make, model, trim, mileage, asking_price_cents,
      title_status, runs_and_drives, known_issues, recent_repairs, seller_notes, created_at, updated_at
      from clearsale_listings where id=$1 and status='published' and storage_status='persisted'`, [id]);
    return result.rows[0] ? publicRow(result.rows[0]) : null;
  }
}
