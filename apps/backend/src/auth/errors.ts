import { GraphQLError } from 'graphql';

export const unauthenticated = (message = 'Authentication required') =>
  new GraphQLError(message, {
    extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
  });

export const forbidden = (message = 'Forbidden') =>
  new GraphQLError(message, {
    extensions: { code: 'FORBIDDEN', http: { status: 403 } },
  });

export const missingOrgContext = () =>
  new GraphQLError('Organization context required (set X-Helyx-Org header)', {
    extensions: { code: 'ORG_CONTEXT_REQUIRED', http: { status: 400 } },
  });

export const badInput = (message: string, field?: string) =>
  new GraphQLError(message, {
    extensions: { code: 'BAD_INPUT', field, http: { status: 400 } },
  });

export const conflict = (message: string) =>
  new GraphQLError(message, {
    extensions: { code: 'CONFLICT', http: { status: 409 } },
  });

export const notFound = (message = 'Not found') =>
  new GraphQLError(message, {
    extensions: { code: 'NOT_FOUND', http: { status: 404 } },
  });
