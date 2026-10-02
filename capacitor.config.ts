import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jacksonkr.InvestmentCalculator",
  appName: "Invest Calc",
  webDir: "out",
  ios: {
    scheme: "Invest Calc",
    // The page draws edge to edge and pads itself for the safe areas.
    contentInset: "never",
  },
  plugins: {
    // Routes fetch() through native networking, so the app can read Yahoo's
    // price history directly without a server or CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
