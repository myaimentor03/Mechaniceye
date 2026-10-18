import { useEffect, useState, type FormEvent } from "react";
import { CustomerAccountGate, type DrivableCustomer } from "./CustomerAccountGate";

type Listing = {
  id: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  vehicleYear: number;
  make: string;
  model: string;
  trim: string;
  vin: string;
  mileage: number;
  askingPriceCents: number;
  titleStatus: string;
  runsAndDrives: string;
  knownIssues: string;
  recentRepairs: string;
  sellerNotes: string;
  status: string;
  storageStatus: string;
  rejectionReason: string | null;
};

const emptyForm = {
  sellerName: "", sellerEmail: "", sellerPhone: "", vehicleYear: "", make: "", model: "", trim: "", vin: "",
  mileage: "", askingPrice: "", titleStatus: "", runsAndDrives: "", knownIssues: "", recentRepairs: "", sellerNotes: "",
};

function fromListing(listing: Listing) {
  return {
    sellerName: listing.sellerName, sellerEmail: listing.sellerEmail, sellerPhone: listing.sellerPhone,
    vehicleYear: String(listing.vehicleYear), make: listing.make, model: listing.model, trim: listing.trim,
    vin: listing.vin, mileage: String(listing.mileage), askingPrice: (listing.askingPriceCents / 100).toFixed(2),
    titleStatus: listing.titleStatus, runsAndDrives: listing.runsAndDrives, knownIssues: listing.knownIssues,
    recentRepairs: listing.recentRepairs, sellerNotes: listing.sellerNotes,
  };
}

export function ClearSaleSellerListingsPage() {
  const [customer, setCustomer] = useState<DrivableCustomer | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(true);

  async function loadListings() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/marketplace/my-listings", { credentials: "include" });
      if (response.status === 401 || response.status === 503) { setNeedsLogin(true); return; }
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not load listings.");
      setNeedsLogin(false); setListings(result.listings || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load listings."); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (customer) void loadListings(); }, [customer]);

  function change(name: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function edit(listing: Listing) { setEditingId(listing.id); setForm(fromListing(listing)); setNotice(""); setError(""); }

  function resetForm() { setEditingId(null); setForm(customer ? { ...emptyForm, sellerEmail: customer.email } : emptyForm); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setNotice(""); setError("");
    const payload = {
      sellerName: form.sellerName, sellerEmail: form.sellerEmail, sellerPhone: form.sellerPhone,
      vehicleYear: form.vehicleYear, make: form.make, model: form.model, trim: form.trim, vin: form.vin,
      mileage: form.mileage, askingPriceCents: Math.round(Number(form.askingPrice) * 100), titleStatus: form.titleStatus,
      runsAndDrives: form.runsAndDrives, knownIssues: form.knownIssues, recentRepairs: form.recentRepairs, sellerNotes: form.sellerNotes,
    };
    try {
      const response = await fetch(editingId ? `/api/marketplace/listings/${encodeURIComponent(editingId)}` : "/api/marketplace/listings", {
        method: editingId ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Listing could not be saved.");
      setNotice("Draft saved. It is not public until explicitly approved."); resetForm(); await loadListings();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Listing could not be saved."); }
    finally { setLoading(false); }
  }

  async function transition(id: string, action: "submit" | "withdraw") {
    setLoading(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/marketplace/listings/${encodeURIComponent(id)}/${action}`, { method: "POST", credentials: "include" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Listing state could not be changed.");
      setNotice(action === "submit" ? "Submitted for review. It is not public yet." : "Listing withdrawn and no longer public."); await loadListings();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Listing state could not be changed."); }
    finally { setLoading(false); }
  }

  if (needsLogin && !customer) return <main className="product-landing"><section className="product-landing-shell"><h1>Your ClearSale listings</h1><p>Sign in to create and manage your own seller listings.</p><CustomerAccountGate initialMode="login" onAuthenticated={(user) => { setCustomer(user); setForm({ ...emptyForm, sellerEmail: user.email }); setNeedsLogin(false); }} /></section></main>;

  return <main className="product-landing"><section className="product-landing-shell">
    <header className="product-landing-hero"><p className="product-landing-eyebrow">Private seller workspace</p><h1>Your ClearSale listings</h1><p>Save drafts, edit your own details, and submit a listing for explicit review. Drafts and rejected or withdrawn listings are never public.</p></header>
    {notice && <div className="alert-card" role="status">{notice}</div>}{error && <div className="alert-card warning" role="alert">{error}</div>}
    <form className="mp-intake-form" onSubmit={save}>
      <fieldset><legend>{editingId ? "Edit listing" : "New listing draft"}</legend><div className="mp-form-grid">
        {(["sellerName","sellerEmail","sellerPhone","vehicleYear","make","model","trim","vin","mileage","askingPrice","titleStatus","runsAndDrives"] as const).map((name) => <label key={name}>{name.replace(/([A-Z])/g, " $1")}<input name={name} value={form[name]} onChange={(event) => change(name, event.target.value)} required={!['sellerPhone','trim','vin'].includes(name)} /></label>)}
      </div><label>Known issues<textarea name="knownIssues" value={form.knownIssues} onChange={(event) => change("knownIssues", event.target.value)} required rows={4} /></label><label>Recent repairs<textarea name="recentRepairs" value={form.recentRepairs} onChange={(event) => change("recentRepairs", event.target.value)} rows={3} /></label><label>Seller notes<textarea name="sellerNotes" value={form.sellerNotes} onChange={(event) => change("sellerNotes", event.target.value)} rows={3} /></label></fieldset>
      <div className="mp-actions"><button className="mp-btn mp-btn-primary" disabled={loading}>{loading ? "Saving..." : editingId ? "Save listing changes" : "Save draft"}</button>{editingId && <button className="mp-btn mp-btn-secondary" type="button" onClick={resetForm}>Cancel edit</button>}</div>
    </form>
    <section className="product-landing-grid" aria-label="Your listings"><h2>Saved listings</h2>{listings.length === 0 && <p>No durable seller listings yet.</p>}{listings.map((listing) => <article className="product-landing-card" key={listing.id}><h3>{listing.vehicleYear} {listing.make} {listing.model}</h3><p>Status: <strong>{listing.status}</strong> · Storage: <strong>{listing.storageStatus}</strong></p>{listing.rejectionReason && <p>{listing.rejectionReason}</p>}<div className="mp-actions"><button className="mp-btn mp-btn-secondary" type="button" onClick={() => edit(listing)}>Edit</button>{["draft","rejected","withdrawn"].includes(listing.status) && <button className="mp-btn mp-btn-primary" type="button" onClick={() => void transition(listing.id, "submit")}>Submit for review</button>}{listing.status !== "withdrawn" && <button className="mp-btn mp-btn-secondary" type="button" onClick={() => void transition(listing.id, "withdraw")}>Withdraw</button>}</div></article>)}</section>
    <aside className="product-landing-warning">ClearSale does not verify title, ownership, vehicle condition, buyer funds, or legal compliance. Publication requires explicit review approval; a saved draft is not a public listing.</aside>
  </section></main>;
}
