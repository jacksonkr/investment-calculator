package com.jacksonkr.InvestmentCalculator;

import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.Window;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        matchSystemBarsToPage();
    }

    // The manifest keeps the activity alive across light/dark switches, so
    // the theme's colors aren't re-applied on their own.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        matchSystemBarsToPage();
    }

    /** Paints the window and system bars in the page's background color. */
    private void matchSystemBarsToPage() {
        int page = ContextCompat.getColor(this, R.color.page);
        boolean light = getResources().getBoolean(R.bool.light_system_bars);
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(page));
        window.setStatusBarColor(page);
        window.setNavigationBarColor(page);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
    }
}
