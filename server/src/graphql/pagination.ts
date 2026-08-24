import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { CursorCodec } from './cursor-codec';

export interface ConnectionResult<T> {
  edges: Array<{ cursor: string; node: T }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export interface ConnectionWindow {
  first: number;
  take: number;
  afterId: string | undefined;
}

export function connectionWindow(options: {
  first: number | undefined;
  after: string | undefined;
  kind: string;
  organizationId: string | null;
  codec: CursorCodec;
  config: AcresConfigService;
}): ConnectionWindow {
  const first = options.first ?? Math.min(20, options.config.graphqlMaxFirst);
  if (
    !Number.isInteger(first) ||
    first < 1 ||
    first > options.config.graphqlMaxFirst
  ) {
    throw ApiException.queryLimitExceeded(
      `first must be between 1 and ${options.config.graphqlMaxFirst}.`,
    );
  }
  const decoded = options.codec.decode(options.after, {
    kind: options.kind,
    organizationId: options.organizationId,
  });
  return {
    first,
    take: first + 1,
    afterId: decoded?.sort[1],
  };
}

export function connectionFromWindow<
  T extends { id: string; createdAt?: string; name?: string },
>(
  rows: T[],
  options: {
    first: number;
    kind: string;
    organizationId: string | null;
    codec: CursorCodec;
  },
): ConnectionResult<T> {
  const page = rows.slice(0, options.first);
  const edges = page.map((node) => ({
    cursor: options.codec.encode({
      kind: options.kind,
      organizationId: options.organizationId,
      sort: [sortValue(node), node.id],
    }),
    node,
  }));
  return {
    edges,
    pageInfo: {
      hasNextPage: rows.length > options.first,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  };
}

function sortValue(row: { createdAt?: string; name?: string }): string {
  return row.createdAt ?? row.name ?? '';
}
