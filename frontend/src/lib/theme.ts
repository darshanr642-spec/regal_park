// Regal Park Villas — luxury editorial palette (Charcoal + Gold/Bronze)
export const colors = {
  surface: "#FAFAFA",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#2C2C2C",
  surfaceTertiary: "#F0EDE8",
  onSurfaceTertiary: "#3D3D3D",
  surfaceInverse: "#1A1A1A",
  onSurfaceInverse: "#FFFFFF",

  brand: "#B8860B",
  brandPrimary: "#C5A059",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#D4AF37",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#EEDD82",
  onBrandTertiary: "#332A00",

  success: "#2E5F3E",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#9B2C2C",
  onError: "#FFFFFF",
  info: "#4A5568",
  onInfo: "#FFFFFF",

  border: "#E5E0D8",
  borderStrong: "#D1C7B7",
  divider: "#E5E0D8",
  muted: "#7A6F5D",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = { sm: 4, md: 8, lg: 16, pill: 999 } as const;

export const font = {
  display: "Georgia", // Playfair Display fallback (serif feel)
  body: "System",
} as const;

export const shadow = {
  card: {
    shadowColor: "#1A1A1A",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

export function formatINR(n: number): string {
  if (n == null || isNaN(n)) return "₹ —";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹ ${(n / 1e3).toFixed(0)}K`;
  return `₹ ${n.toFixed(0)}`;
}

export function statusColor(s: string) {
  const v = (s || "").toUpperCase();
  if (["COMPLETED", "PASS", "APPROVED", "PAID", "RESOLVED"].includes(v))
    return colors.success;
  if (["IN_PROGRESS", "PARTIAL", "SUBMITTED"].includes(v)) return colors.brand;
  if (["DELAYED", "FAIL", "OPEN"].includes(v)) return colors.error;
  if (["PENDING", "NOT_STARTED"].includes(v)) return colors.muted;
  return colors.info;
}
