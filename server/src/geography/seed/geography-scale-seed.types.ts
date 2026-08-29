export interface GeographySeedSummary {
  readonly sourceCount: number;
  readonly regionCount: number;
  readonly geometryCount: number;
  readonly sourceId: string;
  readonly testPoint: { readonly longitude: number; readonly latitude: number };
  readonly fixtureRegionIds: readonly string[];
}
