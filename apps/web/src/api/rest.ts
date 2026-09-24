import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface Instrument {
  symbol: string;
  refPx: string;
}

export interface Health {
  status: "ok";
  version: string;
  uptimeSec: number;
  sandboxes: number;
}

export const restApi = createApi({
  reducerPath: "rest",
  baseQuery: fetchBaseQuery({ baseUrl: `${window.location.origin}/` }),
  endpoints: (build) => ({
    health: build.query<Health, void>({ query: () => "health" }),
    instruments: build.query<Instrument[], void>({ query: () => "api/instruments" }),
  }),
});

export const { useHealthQuery, useInstrumentsQuery } = restApi;
