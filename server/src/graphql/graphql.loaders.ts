import DataLoader from 'dataloader';
import type { RegionSummary } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { RegionsService } from '../regions/regions.service';

export interface AcresGraphqlLoaders {
  regionBySlug: DataLoader<string, RegionSummary>;
}

export function createGraphqlLoaders(
  regions: RegionsService,
  statementTimeoutMs: number,
): AcresGraphqlLoaders {
  return {
    regionBySlug: new DataLoader<string, RegionSummary>(async (slugs) => {
      const bySlug = await regions.findBySlugs(slugs, statementTimeoutMs);
      return slugs.map(
        (slug) =>
          bySlug.get(slug) ??
          ApiException.notFound(`No region matches "${slug}".`),
      );
    }),
  };
}
