import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface UiState {
  selectedTag: number | null;
  showIntro: boolean;
}

const uiSlice = createSlice({
  name: "ui",
  initialState: { selectedTag: null, showIntro: true } as UiState,
  reducers: {
    selectTag(state, action: PayloadAction<number | null>) {
      state.selectedTag = action.payload;
    },
    hideIntro(state) {
      state.showIntro = false;
    },
  },
});

export const { selectTag, hideIntro } = uiSlice.actions;
export default uiSlice.reducer;
