import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import type { Request, Response } from 'express';
import { AcresConfigService } from '../config/acres-config.service';
import { requestIdFrom } from '../common/request-context';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RegionsModule } from '../regions/regions.module';
import { RegionsService } from '../regions/regions.service';
import { SessionsModule } from '../sessions/sessions.module';
import { SessionsService } from '../sessions/sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { AcresResolver } from './acres.resolver';
import { CursorCodec } from './cursor-codec';
import type { AcresGraphqlContext } from './graphql.context';
import { createGraphqlLoaders } from './graphql.loaders';
import { createGraphqlLimitPlugin } from './graphql-limits';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Module({
  imports: [
    PrismaModule,
    SessionsModule,
    OrganizationsModule,
    RegionsModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [PrismaModule, SessionsModule, RegionsModule],
      inject: [
        AcresConfigService,
        SessionsService,
        TenantTransactionService,
        RegionsService,
      ],
      useFactory: (
        config: AcresConfigService,
        sessions: SessionsService,
        tenants: TenantTransactionService,
        regions: RegionsService,
      ) => ({
        path: '/graphql',
        autoSchemaFile: true,
        sortSchema: true,
        playground: false,
        graphiql: false,
        introspection: !config.isProduction,
        debug: false,
        context: async ({
          req,
          res,
        }: {
          req: Request;
          res: Response;
        }): Promise<AcresGraphqlContext> => {
          const requestId = requestIdFrom(req);
          const loaders = createGraphqlLoaders(
            regions,
            config.graphqlTimeoutMs,
          );
          const token = (req.cookies as Record<string, string> | undefined)?.[
            config.sessionCookieName
          ];
          if (typeof token !== 'string' || token.length === 0) {
            return {
              req,
              res,
              requestId,
              session: null,
              organization: null,
              loaders,
            };
          }
          const session = await sessions.resolve(token, {
            statementTimeoutMs: config.graphqlTimeoutMs,
          });
          if (session === null) {
            return {
              req,
              res,
              requestId,
              session: null,
              organization: null,
              loaders,
            };
          }
          const organizationId = (
            req.header('x-organization-id') ??
            req.header('x-acres-organization-id') ??
            ''
          ).trim();
          if (!UUID_RE.test(organizationId)) {
            return {
              req,
              res,
              requestId,
              session,
              organization: null,
              loaders,
            };
          }
          const membership = await tenants.accountScoped(
            session.account.id,
            (tx) =>
              tx.membership.findFirst({
                where: {
                  organizationId,
                  accountId: session.account.id,
                  revokedAt: null,
                },
              }),
            { statementTimeoutMs: config.graphqlTimeoutMs },
          );
          if (membership === null) {
            return {
              req,
              res,
              requestId,
              session,
              organization: null,
              loaders,
            };
          }
          return {
            req,
            res,
            requestId,
            session,
            organization: {
              organizationId,
              accountId: session.account.id,
              membershipId: membership.id,
              role: membership.role,
              statementTimeoutMs: config.graphqlTimeoutMs,
            },
            loaders,
          };
        },
        plugins: [createGraphqlLimitPlugin(config)],
        formatError: (formatted) => ({
          message: formatted.message,
          extensions: {
            code: formatted.extensions?.code ?? 'INTERNAL_ERROR',
            ...(formatted.extensions?.requestId
              ? { requestId: formatted.extensions.requestId }
              : {}),
          },
        }),
      }),
    }),
  ],
  providers: [AcresResolver, CursorCodec],
})
export class AcresGraphqlModule {}
