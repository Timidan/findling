/**
 * Pure assembly of the studio read-model — joins catalog rows, sales aggregates,
 * and a pre-signed poster-URL map into the shaped `StudioMoment[]` plus its
 * derived totals. Extracted DB- and network-free so it is unit-testable and so
 * the poster URLs are signed in ONE batch by the caller rather than one network
 * round-trip per row (see `getStudioData`).
 */

export interface StudioMoment {
  momentId: string;
  title: string;
  description: string | null;
  status: string;
  usageType: string;
  sourceType: string;
  durationMs: number;
  priceMicroUsdc: number;
  ownershipVerified: boolean;
  posterUrl: string | null;
  licenses: number;
  earnedMicroUsdc: number;
  createdAt: Date;
}

export interface StudioCatalogRow {
  moment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    usageType: string;
    durationMs: number;
    priceMicroUsdc: number;
    ownershipVerified: boolean;
    posterStorageKey: string | null;
    createdAt: Date;
  };
  asset: {
    sourceType: string;
  };
}

export interface StudioSaleAgg {
  licenses: number;
  earned: number;
}

export function assembleStudioMoments(
  rows: StudioCatalogRow[],
  salesByMoment: Map<string, StudioSaleAgg>,
  posterUrlByKey: Map<string, string | null>,
): { moments: StudioMoment[]; publishedCount: number; earnedMicroUsdc: number } {
  const moments: StudioMoment[] = rows.map(({ moment, asset }) => {
    const sale = salesByMoment.get(moment.id);
    return {
      momentId: moment.id,
      title: moment.title,
      description: moment.description,
      status: moment.status,
      usageType: moment.usageType,
      sourceType: asset.sourceType,
      durationMs: moment.durationMs,
      priceMicroUsdc: moment.priceMicroUsdc,
      ownershipVerified: moment.ownershipVerified,
      posterUrl: moment.posterStorageKey
        ? posterUrlByKey.get(moment.posterStorageKey) ?? null
        : null,
      licenses: sale?.licenses ?? 0,
      earnedMicroUsdc: sale?.earned ?? 0,
      createdAt: moment.createdAt,
    };
  });

  const publishedCount = moments.filter((m) => m.status === "published").length;
  const earnedMicroUsdc = moments.reduce((total, m) => total + m.earnedMicroUsdc, 0);

  return { moments, publishedCount, earnedMicroUsdc };
}
