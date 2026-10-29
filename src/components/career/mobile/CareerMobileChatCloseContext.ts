import { createContext, useContext } from "react";

export const CareerMobileChatCloseContext = createContext<(() => void) | null>(
  null
);

export const useCareerMobileChatClose = () =>
  useContext(CareerMobileChatCloseContext);
