export interface BadgeCatalogEntry {
  key: string;
  name: string;
  description: string;
  icon: string;
  trigger: string;
  threshold: number;
}

export interface AwardedBadge {
  id: string;
  badgeId: string;
  badgeKey: string;
  name: string;
  description: string | null;
  icon: string | null;
  awardedAt: string;
}
