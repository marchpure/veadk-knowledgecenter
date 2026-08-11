import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { setContext } from '@apollo/client/link/context';
import errorHandler from '@/utils/errorHandler';

const apolloErrorLink = onError((error) => errorHandler(error));

const projectContextLink = setContext((_, { headers }) => {
  if (typeof window === 'undefined') return { headers };
  const projectId = new URLSearchParams(window.location.search).get(
    'projectId',
  );
  return {
    headers: {
      ...headers,
      ...(projectId ? { 'x-veadk-project-id': projectId } : {}),
    },
  };
});

const httpLink = new HttpLink({
  uri: '/api/graphql',
});

const client = new ApolloClient({
  link: from([apolloErrorLink, projectContextLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
