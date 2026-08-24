import type { ApolloServerPlugin } from '@apollo/server';
import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
} from 'graphql';
import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from 'graphql-query-complexity';
import { AcresConfigService } from '../config/acres-config.service';
import type { AcresGraphqlContext } from './graphql.context';

/* eslint-disable @typescript-eslint/require-await */

export function createGraphqlLimitPlugin(
  config: AcresConfigService,
): ApolloServerPlugin<AcresGraphqlContext> {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation(context) {
          if (
            config.nodeEnv !== 'development' &&
            !context.request.operationName
          ) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              'GraphQL operationName is required.',
              context.contextValue.requestId,
            );
          }

          const document = context.document;
          const operationCount = document.definitions.filter(
            (definition) => definition.kind === Kind.OPERATION_DEFINITION,
          ).length;
          if (operationCount !== 1) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              'Exactly one GraphQL operation is allowed.',
              context.contextValue.requestId,
            );
          }
          const astCounts = countOperation({
            document,
            operationName: context.request.operationName ?? undefined,
            variables: context.request.variables,
            defaultFirst: Math.min(20, config.graphqlMaxFirst),
          });
          if (astCounts.aliases > config.graphqlMaxAliases) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              `GraphQL aliases exceed ${config.graphqlMaxAliases}.`,
              context.contextValue.requestId,
            );
          }
          if (astCounts.depth > config.graphqlMaxDepth) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              `GraphQL depth exceeds ${config.graphqlMaxDepth}.`,
              context.contextValue.requestId,
            );
          }
          if (astCounts.firstTotal > config.graphqlMaxNodes) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              `GraphQL requested nodes exceed ${config.graphqlMaxNodes}.`,
              context.contextValue.requestId,
            );
          }
          const complexity = getComplexity({
            schema: context.schema,
            query: document,
            variables: context.request.variables,
            operationName: context.request.operationName ?? undefined,
            estimators: [
              fieldExtensionsEstimator(),
              simpleEstimator({ defaultComplexity: 1 }),
            ],
          });
          if (
            Math.max(complexity, astCounts.fieldCost) > config.graphqlMaxCost
          ) {
            reject(
              'QUERY_LIMIT_EXCEEDED',
              `GraphQL complexity exceeds ${config.graphqlMaxCost}.`,
              context.contextValue.requestId,
            );
          }
        },
      };
    },
  };
}

function reject(code: string, message: string, requestId: string): never {
  throw new GraphQLError(message, {
    extensions: { code, requestId, http: { status: 200 } },
  });
}

function countOperation(input: {
  document: DocumentNode;
  operationName: string | undefined;
  variables: Record<string, unknown> | undefined;
  defaultFirst: number;
}): {
  aliases: number;
  depth: number;
  firstTotal: number;
  fieldCost: number;
} {
  let aliases = 0;
  let depth = 0;
  let firstTotal = 0;
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];

  for (const definition of input.document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition);
    }
  }

  const operation =
    operations.find(
      (candidate) => candidate.name?.value === input.operationName,
    ) ?? operations[0];

  const fieldCost = operation
    ? walkSelectionSet(operation.selectionSet, 0, new Set<string>())
    : 0;

  return { aliases, depth, firstTotal, fieldCost };

  function walkSelectionSet(
    selectionSet: SelectionSetNode,
    parentDepth: number,
    fragmentStack: Set<string>,
  ): number {
    let cost = 0;
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        const fieldDepth = parentDepth + 1;
        depth = Math.max(depth, fieldDepth);
        if (selection.alias) aliases += 1;

        const first = firstArgumentValue(selection.arguments);
        if (first !== undefined) firstTotal += first;

        const childCost = selection.selectionSet
          ? walkSelectionSet(selection.selectionSet, fieldDepth, fragmentStack)
          : 0;
        const multiplier = first ?? connectionDefault(selection.name.value);
        cost += 1 + multiplier * childCost;
      }

      if (selection.kind === Kind.INLINE_FRAGMENT) {
        cost += walkSelectionSet(
          selection.selectionSet,
          parentDepth,
          fragmentStack,
        );
      }

      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        const fragmentName = selection.name.value;
        if (fragmentStack.has(fragmentName)) continue;
        const fragment = fragments.get(fragmentName);
        if (fragment === undefined) continue;
        const nextStack = new Set(fragmentStack);
        nextStack.add(fragmentName);
        cost += walkSelectionSet(fragment.selectionSet, parentDepth, nextStack);
      }
    }
    return cost;
  }

  function firstArgumentValue(
    args: readonly { name: { value: string }; value: ValueNode }[] | undefined,
  ): number | undefined {
    const first = args?.find((arg) => arg.name.value === 'first');
    if (first?.value.kind === Kind.INT) return Number(first.value.value);
    if (first?.value.kind === Kind.VARIABLE) {
      const value = input.variables?.[first.value.name.value];
      if (typeof value === 'number' && Number.isInteger(value)) return value;
    }
    return undefined;
  }

  function connectionDefault(fieldName: string): number {
    return CONNECTION_FIELDS.has(fieldName) ? input.defaultFirst : 1;
  }
}

const CONNECTION_FIELDS = new Set([
  'organizationMembers',
  'organizationInvitations',
  'organizationAuditEvents',
  'regions',
]);
