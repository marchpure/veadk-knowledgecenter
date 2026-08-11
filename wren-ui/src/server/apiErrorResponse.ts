import type { NextApiResponse } from 'next';
import { GraphQLError } from 'graphql';
import { GeneralErrorCodes, shortMessages } from '@/apollo/server/utils/error';

const getErrorCode = (error: unknown) => {
  if (error instanceof GraphQLError) {
    return String(
      error.extensions?.code || GeneralErrorCodes.INTERNAL_SERVER_ERROR,
    );
  }
  return GeneralErrorCodes.INTERNAL_SERVER_ERROR;
};

const getOther = (error: unknown) => {
  if (error instanceof GraphQLError) {
    return (error.extensions?.other || {}) as Record<string, unknown>;
  }
  return {};
};

const getMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return 'Request failed.';
};

const isStructuredApiError = (
  error: unknown,
): error is Error & {
  statusCode?: number;
  code?: string;
  shortMessage?: string;
  stage?: string;
  dependency?: string;
  advice?: string;
} =>
  error instanceof Error &&
  Boolean(
    (error as any).statusCode ||
      (error as any).code ||
      (error as any).stage ||
      (error as any).advice,
  );

export const toApiErrorPayload = (error: unknown) => {
  if (isStructuredApiError(error)) {
    const statusCode = error.statusCode || 500;
    return {
      statusCode,
      error: error.message,
      message: error.message,
      shortMessage: error.shortMessage || error.message,
      code: error.code || GeneralErrorCodes.INTERNAL_SERVER_ERROR,
      stage: error.stage,
      dependency: error.dependency,
      advice: error.advice,
    };
  }

  const code = getErrorCode(error);
  const other = getOther(error);
  const message = getMessage(error);

  if (code === GeneralErrorCodes.WREN_ENGINE_ERROR) {
    return {
      statusCode: 503,
      error: message,
      message,
      shortMessage: 'Wren Engine unavailable',
      code,
      stage: String(other.stage || 'wren_engine_request'),
      dependency: String(other.dependency || 'Wren Engine'),
      advice:
        'Start the isolated Wren Engine service and set WREN_ENGINE_ENDPOINT to the reachable endpoint before retrying.',
    };
  }

  if (code === GeneralErrorCodes.INIT_SQL_ERROR) {
    return {
      statusCode: 400,
      error: message,
      message,
      shortMessage: shortMessages[GeneralErrorCodes.INIT_SQL_ERROR],
      code,
      stage: String(other.stage || 'duckdb_init_sql'),
      dependency: String(other.dependency || 'Wren Engine'),
      advice:
        'Check the DuckDB initialization SQL syntax and retry after correcting the statement shown above.',
    };
  }

  if (code === GeneralErrorCodes.SESSION_PROPS_ERROR) {
    return {
      statusCode: 400,
      error: message,
      message,
      shortMessage: shortMessages[GeneralErrorCodes.SESSION_PROPS_ERROR],
      code,
      stage: String(other.stage || 'duckdb_session_props'),
      dependency: String(other.dependency || 'Wren Engine'),
      advice: 'Check the DuckDB session properties and retry.',
    };
  }

  return {
    statusCode: 500,
    error: message,
    message,
    shortMessage:
      shortMessages[code as GeneralErrorCodes] ||
      shortMessages[GeneralErrorCodes.INTERNAL_SERVER_ERROR],
    code,
  };
};

export const sendApiError = (res: NextApiResponse, error: unknown) => {
  const { statusCode, ...payload } = toApiErrorPayload(error);
  res.status(statusCode).json(payload);
};
