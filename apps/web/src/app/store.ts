import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";

import { restApi } from "../api/rest";
import connection from "../features/connection/connectionSlice";
import { wsMiddleware } from "../features/connection/wsMiddleware";
import ui from "../features/dictionary/uiSlice";
import messages from "../features/flow/messagesSlice";
import orders from "../features/orders/ordersSlice";
import session from "../features/session/sessionSlice";

const rootReducer = combineReducers({
  connection,
  session,
  messages,
  orders,
  ui,
  [restApi.reducerPath]: restApi.reducer,
});

export function makeStore() {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(wsMiddleware, restApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
