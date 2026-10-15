import * as realConvex from "convex/react";
import * as mockConvex from "../e2e/mockReactConvex";
import { isE2eMockEnabled } from "../constants/e2eMock";

export const ConvexProvider = (
  isE2eMockEnabled() ? mockConvex.ConvexProvider : realConvex.ConvexProvider
) as typeof realConvex.ConvexProvider;

export const useQuery = (
  isE2eMockEnabled() ? mockConvex.useQuery : realConvex.useQuery
) as typeof realConvex.useQuery;

export const useMutation = (
  isE2eMockEnabled() ? mockConvex.useMutation : realConvex.useMutation
) as typeof realConvex.useMutation;

export const usePaginatedQuery = (
  isE2eMockEnabled() ? mockConvex.usePaginatedQuery : realConvex.usePaginatedQuery
) as typeof realConvex.usePaginatedQuery;
