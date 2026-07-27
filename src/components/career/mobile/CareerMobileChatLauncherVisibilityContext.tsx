"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type CareerMobileChatLauncherVisibilityContextValue = {
  isChatLauncherHidden: boolean;
  setChatLauncherHidden: (hidden: boolean) => void;
};

const defaultContextValue: CareerMobileChatLauncherVisibilityContextValue = {
  isChatLauncherHidden: false,
  setChatLauncherHidden: () => undefined,
};

const CareerMobileChatLauncherVisibilityContext =
  createContext<CareerMobileChatLauncherVisibilityContextValue | null>(null);

export const CareerMobileChatLauncherVisibilityProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isChatLauncherHidden, setChatLauncherHidden] = useState(false);
  const value = useMemo(
    () => ({
      isChatLauncherHidden,
      setChatLauncherHidden,
    }),
    [isChatLauncherHidden]
  );

  return (
    <CareerMobileChatLauncherVisibilityContext.Provider value={value}>
      {children}
    </CareerMobileChatLauncherVisibilityContext.Provider>
  );
};

export const useCareerMobileChatLauncherVisibility = () =>
  useContext(CareerMobileChatLauncherVisibilityContext) ?? defaultContextValue;
