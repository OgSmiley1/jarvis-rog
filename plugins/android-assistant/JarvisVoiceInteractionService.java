package com.app.localjarviscoach.jarvis;

import android.service.voice.VoiceInteractionService;
import android.util.Log;

public class JarvisVoiceInteractionService extends VoiceInteractionService {
  private static final String TAG = "JarvisAssistant";

  @Override
  public void onReady() {
    super.onReady();
    Log.i(TAG, "JARVIS digital assistant service ready");
  }

  @Override
  public void onShutdown() {
    Log.i(TAG, "JARVIS digital assistant service shutting down");
    super.onShutdown();
  }
}
