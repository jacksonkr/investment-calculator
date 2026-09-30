import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jacksonkr.InvestmentCalculator",
  appName: "Invest Calc",
  webDir: "out",
  ios: {
    scheme: "Invest Calc",
    // Keeps the page clear of the status bar and home indicator.
    contentInset: "automatic",
  },
  plugins: {
    // Routes fetch() through native networking, so the app can read Yahoo's
    // price history directly without a server or CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
