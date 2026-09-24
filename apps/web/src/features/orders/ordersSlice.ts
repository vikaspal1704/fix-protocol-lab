import { createSlice } from "@reduxjs/toolkit";

import type { OrderUpdateEvent } from "../../protocol";
import { connect, serverEvent } from "../connection/actions";

interface OrdersState {
  byId: Record<string, OrderUpdateEvent>;
  order: string[];
}

const ordersSlice = createSlice({
  name: "orders",
  initialState: { byId: {}, order: [] } as OrdersState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(connect, () => ({ byId: {}, order: [] }))
      .addCase(serverEvent, (state, { payload }) => {
        if (payload.type !== "order.update") return;
        if (!state.byId[payload.clOrdId]) state.order.unshift(payload.clOrdId);
        state.byId[payload.clOrdId] = payload;
      });
  },
});

export default ordersSlice.reducer;
