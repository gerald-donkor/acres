import { isApiErrorCode, REQUEST_ID_HEADER_NAME } from "@acres/shared";
import { ApiClientError } from "./envelope";

type GraphqlResponse<TData> = {
  data?: TData | null;
  errors?: Array<{
    message?: string;
    extensions?: { code?: unknown; requestId?: string };
  }>;
};

export async function parseGraphqlResponse<TData>(
  response: Response,
): Promise<TData> {
  let payload: GraphqlResponse<TData> | null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError({
      code: "INTERNAL_ERROR",
      message: "The API returned an unreadable response.",
      status: response.status,
      requestId: response.headers.get(REQUEST_ID_HEADER_NAME) ?? undefined,
    });
  }
  if (!response.ok || payload?.errors?.length || payload?.data == null) {
    const first = payload?.errors?.[0];
    throw new ApiClientError({
      code: isApiErrorCode(first?.extensions?.code)
        ? first.extensions.code
        : "INTERNAL_ERROR",
      message: "The GraphQL request could not be completed.",
      requestId:
        first?.extensions?.requestId ??
        response.headers.get(REQUEST_ID_HEADER_NAME) ??
        undefined,
      status: response.status,
    });
  }
  return payload.data;
}
