import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { GqlArgumentsHost, GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import type { ApiErrorCode } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { AcresGraphqlContext } from './graphql.context';

@Catch()
export class GraphqlErrorFilter implements GqlExceptionFilter {
  private readonly logger = new Logger(GraphqlErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): GraphQLError {
    const context =
      GqlArgumentsHost.create(host).getContext<AcresGraphqlContext>();
    const requestId = context?.requestId;

    const apiError = apiErrorFrom(exception);
    if (apiError !== null) {
      return new GraphQLError(apiError.message, {
        extensions: {
          code: apiError.code,
          ...(requestId ? { requestId } : {}),
        },
      });
    }
    this.logger.error(
      `Unhandled GraphQL exception${requestId ? ` requestId=${requestId}` : ''}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return new GraphQLError('Something went wrong.', {
      extensions: {
        code: 'INTERNAL_ERROR',
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}

function apiErrorFrom(
  exception: unknown,
): { code: ApiErrorCode; message: string } | null {
  if (exception instanceof ApiException) {
    return { code: exception.code, message: exception.message };
  }
  if (!(exception instanceof HttpException)) return null;

  const response = exception.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    'message' in response &&
    typeof (response as { code?: unknown }).code === 'string' &&
    typeof (response as { message?: unknown }).message === 'string'
  ) {
    return response as { code: ApiErrorCode; message: string };
  }
  return null;
}
