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
  android: {
    // On Android 15+ the system draws edge to edge; this keeps the page
    // below the status bar, since the WebView reports no safe-area insets.
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    // Routes fetch() through native networking, so the app can read Yahoo's
    // price history directly without a server or CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
