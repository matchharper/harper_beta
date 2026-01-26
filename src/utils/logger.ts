// utils/logger.ts
const isProd = process.env.NODE_ENV === "production";

export const logger = {
  log: (...args: any[]) => {
    if (!isProd) {
      console.log("[LOG] ", ...args);
    }
  },
};
