// api.ts

import axios from "axios";
import type { GraphQLResponse } from "./types";

export const fetchGraphQLData = async <T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>
) => {
  const response = await axios.post<GraphQLResponse<T>>(endpoint, {
    query,
    ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
  });
  const body = response.data as GraphQLResponse<T> & { errors?: unknown[] };
  if (body.errors?.length) {
    throw new Error(JSON.stringify(body.errors));
  }
  return body.data;
};

// Simple JSON-RPC caller for Cartesi v2 rollups node.
export const callJsonRpc = async <T = unknown>(
  endpoint: string,
  method: string,
  params: Record<string, unknown>
): Promise<T> => {
  const response = await axios.post(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
  if (response.data?.error) {
    throw new Error(response.data.error.message ?? "JSON-RPC error");
  }
  return response.data?.result as T;
};