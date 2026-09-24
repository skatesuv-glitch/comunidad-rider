package com.eskatesuv.ridervoz;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RiderVoicePlugin.class);
        registerPlugin(RiderCommandsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
