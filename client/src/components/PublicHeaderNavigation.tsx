import { type ReactNode, useEffect, useRef, useState } from "react";

export const PUBLIC_REVIEW_PATH = "/mechanics-eye-review";

export type PublicNavigationItem = Readonly<{
  label: string;
  href: string;
}>;

export const DRIVABLE_PUBLIC_NAVIGATION: readonly PublicNavigationItem[] = Object.freeze([
  { label: "Home", href: "/" },
  { label: "Drivable Check", href: "/drivable-check" },
  { label: "ClearSale", href: "/clearsale" },
  { label: "Buyer Check", href: "/buyer-check" },
  { label: "Mechanic Match", href: "/mechanic-match" },
  { label: "Mechanic's Eye Review", href: PUBLIC_REVIEW_PATH },
  { label: "Help", href: "/help" },
  { label: "Disclaimer", href: "/disclaimer" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
]);

type PublicHeaderNavigationProps = Readonly<{
  ariaLabel: string;
  brand: ReactNode;
  items: readonly PublicNavigationItem[];
  menuId: string;
  navClassName: string;
}>;

export function PublicHeaderNavigation({
  ariaLabel,
  brand,
  items,
  menuId,
  navClassName,
}: PublicHeaderNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <>
      <div className="public-header-identity">
        {brand}
        <button
          ref={triggerRef}
          type="button"
          className="public-menu-toggle"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Close menu" : "Menu"}
        </button>
      </div>
      <nav
        id={menuId}
        className={`${navClassName} public-nav${open ? " is-open" : ""}`}
        aria-label={ariaLabel}
      >
        {items.map((item) => (
          <a key={`${item.label}-${item.href}`} href={item.href} onClick={closeMenu}>
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );
}

export function DrivablePublicHeader() {
  return (
    <PublicHeaderNavigation
      ariaLabel="Drivable navigation"
      brand={<a className="brand" href="/">Drivable by Mechanic&apos;s Eye</a>}
      items={DRIVABLE_PUBLIC_NAVIGATION}
      menuId="drivable-public-navigation"
      navClassName="nav"
    />
  );
}
