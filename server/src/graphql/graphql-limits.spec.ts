import { buildSchema, GraphQLError, parse } from 'graphql';
import type { AcresConfigService } from '../config/acres-config.service';
import {
  CONNECTION_FIELDS,
  countOperation,
  createGraphqlLimitPlugin,
  isConnectionField,
} from './graphql-limits';
import type { AcresGraphqlContext } from './graphql.context';

describe('graphql-limits', () => {
  const schema = buildSchema(`
    type Query {
      viewer: Viewer
      regions(first: Int): RegionConnection
      organizationMembers(first: Int): MemberConnection
      organizationInvitations(first: Int): InvitationConnection
      organizationAuditEvents(first: Int): AuditConnection
    }

    type Viewer {
      id: ID!
      email: String!
      profile: Profile
    }

    type Profile {
      bio: String
      details: Details
    }

    type Details {
      info: String
    }

    type RegionConnection {
      edges: [RegionEdge]
    }

    type RegionEdge {
      node: Region
    }

    type Region {
      id: ID!
      name: String!
    }

    type MemberConnection {
      edges: [MemberEdge]
    }

    type MemberEdge {
      node: Member
    }

    type Member {
      id: ID!
    }

    type InvitationConnection {
      edges: [InvitationEdge]
    }

    type InvitationEdge {
      node: Invitation
    }

    type Invitation {
      id: ID!
    }

    type AuditConnection {
      edges: [AuditEdge]
    }

    type AuditEdge {
      node: Audit
    }

    type Audit {
      id: ID!
    }
  `);

  function createMockConfig(
    overrides: Partial<AcresConfigService> = {},
  ): AcresConfigService {
    return {
      nodeEnv: 'production',
      graphqlMaxAliases: 10,
      graphqlMaxDepth: 5,
      graphqlMaxCost: 100,
      graphqlMaxFirst: 50,
      graphqlMaxNodes: 100,
      ...overrides,
    } as unknown as AcresConfigService;
  }

  describe('CONNECTION_FIELDS and isConnectionField', () => {
    it('contains all canonical connection fields', () => {
      expect(CONNECTION_FIELDS.has('organizationMembers')).toBe(true);
      expect(CONNECTION_FIELDS.has('organizationInvitations')).toBe(true);
      expect(CONNECTION_FIELDS.has('organizationAuditEvents')).toBe(true);
      expect(CONNECTION_FIELDS.has('regions')).toBe(true);
    });

    it('verifies isConnectionField', () => {
      expect(isConnectionField('regions')).toBe(true);
      expect(isConnectionField('organizationMembers')).toBe(true);
      expect(isConnectionField('viewer')).toBe(false);
      expect(isConnectionField('randomField')).toBe(false);
    });
  });

  describe('countOperation', () => {
    it('calculates depth and cost for a simple query', () => {
      const doc = parse(`
        query Simple {
          viewer {
            id
            email
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'Simple',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.aliases).toBe(0);
      expect(counts.depth).toBe(2);
      expect(counts.firstTotal).toBe(0);
      expect(counts.fieldCost).toBeGreaterThan(0);
    });

    it('counts aliases correctly', () => {
      const doc = parse(`
        query Aliased {
          first: viewer {
            a1: id
            a2: email
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'Aliased',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.aliases).toBe(3);
    });

    it('extracts literal first argument', () => {
      const doc = parse(`
        query WithFirst {
          regions(first: 25) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'WithFirst',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.firstTotal).toBe(25);
      expect(counts.depth).toBe(4);
    });

    it('extracts variable first argument', () => {
      const doc = parse(`
        query WithVarFirst($limit: Int) {
          regions(first: $limit) {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'WithVarFirst',
        variables: { limit: 40 },
        defaultFirst: 20,
      });

      expect(counts.firstTotal).toBe(40);
    });

    it('uses connection default when first argument is omitted on connection fields', () => {
      const doc = parse(`
        query DefaultConnection {
          regions {
            edges {
              node {
                id
              }
            }
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'DefaultConnection',
        variables: {},
        defaultFirst: 15,
      });

      expect(counts.firstTotal).toBe(0);
      expect(counts.fieldCost).toBeGreaterThan(15);
    });

    it('resolves fragment definitions and spreads without cyclic loops', () => {
      const doc = parse(`
        query WithFragments {
          viewer {
            ...ViewerFields
          }
        }

        fragment ViewerFields on Viewer {
          id
          email
          profile {
            ...ProfileFields
          }
        }

        fragment ProfileFields on Profile {
          bio
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'WithFragments',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.depth).toBe(3);
      expect(counts.fieldCost).toBeGreaterThan(0);
    });

    it('handles inline fragments', () => {
      const doc = parse(`
        query WithInline {
          viewer {
            ... on Viewer {
              id
              email
            }
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'WithInline',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.depth).toBe(2);
    });

    it('falls back to first operation if operationName does not match', () => {
      const doc = parse(`
        query FallbackOp {
          viewer {
            id
          }
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: 'UnmatchedOp',
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.depth).toBe(2);
    });

    it('returns zero counts when document has no operation', () => {
      const doc = parse(`
        fragment ViewerFrag on Viewer {
          id
        }
      `);
      const counts = countOperation({
        document: doc,
        operationName: undefined,
        variables: {},
        defaultFirst: 20,
      });

      expect(counts.depth).toBe(0);
      expect(counts.fieldCost).toBe(0);
    });
  });

  describe('createGraphqlLimitPlugin', () => {
    const defaultContext = {
      requestId: 'req-test-999',
    } as unknown as AcresGraphqlContext;

    it('rejects missing operationName in non-development environment', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ nodeEnv: 'production' }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      let thrownError: unknown;
      try {
        await listener?.didResolveOperation?.({
          request: { operationName: undefined, variables: {} },
          document: parse('query { viewer { id } }'),
          schema,
          contextValue: defaultContext,
        } as never);
      } catch (err: unknown) {
        thrownError = err;
      }
      expect(thrownError).toBeInstanceOf(GraphQLError);
      const gqlError = thrownError as GraphQLError;
      expect(gqlError.message).toBe('GraphQL operationName is required.');
      expect(gqlError.extensions?.code).toBe('QUERY_LIMIT_EXCEEDED');
      expect(gqlError.extensions?.requestId).toBe('req-test-999');
    });

    it('allows missing operationName in development environment', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ nodeEnv: 'development' }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: undefined, variables: {} },
          document: parse('query { viewer { id } }'),
          schema,
          contextValue: defaultContext,
        } as never),
      ).resolves.toBeUndefined();
    });

    it('rejects document with zero operation definitions', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ nodeEnv: 'development' }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: undefined, variables: {} },
          document: parse('fragment Foo on Viewer { id }'),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('Exactly one GraphQL operation is allowed.');
    });

    it('rejects document with multiple operations', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ nodeEnv: 'production' }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'Op1', variables: {} },
          document: parse(`
            query Op1 { viewer { id } }
            query Op2 { viewer { email } }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('Exactly one GraphQL operation is allowed.');
    });

    it('rejects query exceeding max aliases', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ graphqlMaxAliases: 2 }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'TooManyAliases', variables: {} },
          document: parse(`
            query TooManyAliases {
              a1: viewer { id }
              a2: viewer { email }
              a3: viewer { id }
            }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('GraphQL aliases exceed 2.');
    });

    it('rejects query exceeding max depth', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ graphqlMaxDepth: 2 }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'TooDeep', variables: {} },
          document: parse(`
            query TooDeep {
              viewer {
                profile {
                  details {
                    info
                  }
                }
              }
            }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('GraphQL depth exceeds 2.');
    });

    it('rejects query exceeding max nodes', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ graphqlMaxNodes: 20 }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'TooManyNodes', variables: {} },
          document: parse(`
            query TooManyNodes {
              regions(first: 30) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('GraphQL requested nodes exceed 20.');
    });

    it('rejects query exceeding max complexity', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({ graphqlMaxCost: 5, graphqlMaxFirst: 20 }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'HighCost', variables: {} },
          document: parse(`
            query HighCost {
              regions(first: 10) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).rejects.toThrow('GraphQL complexity exceeds 5.');
    });

    it('allows valid query within all constraints', async () => {
      const plugin = createGraphqlLimitPlugin(
        createMockConfig({
          graphqlMaxAliases: 10,
          graphqlMaxDepth: 5,
          graphqlMaxCost: 100,
          graphqlMaxNodes: 50,
        }),
      );
      const listener = await plugin.requestDidStart?.({} as never);

      await expect(
        listener?.didResolveOperation?.({
          request: { operationName: 'ValidQuery', variables: {} },
          document: parse(`
            query ValidQuery {
              viewer {
                id
                email
              }
            }
          `),
          schema,
          contextValue: defaultContext,
        } as never),
      ).resolves.toBeUndefined();
    });
  });
});
