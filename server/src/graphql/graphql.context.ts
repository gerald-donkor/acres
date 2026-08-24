import type { Request, Response } from 'express';
import type { SessionContext } from '../sessions/authenticated-request';
import type { OrganizationContext } from '../organizations/organization-context';
import type { AcresGraphqlLoaders } from './graphql.loaders';

export interface AcresGraphqlContext {
  req: Request;
  res: Response;
  requestId: string;
  session: SessionContext | null;
  organization: OrganizationContext | null;
  loaders: AcresGraphqlLoaders;
}
