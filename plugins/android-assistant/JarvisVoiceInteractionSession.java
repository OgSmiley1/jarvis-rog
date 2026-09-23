package com.app.localjarviscoach.jarvis;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.util.Log;

import com.app.localjarviscoach.MainActivity;

public class JarvisVoiceInteractionSession extends VoiceInteractionSession {
  private static final String TAG = "JarvisAssistant";
  private boolean handedOff = false;

  public JarvisVoiceInteractionSession(Context context) {
    super(context);
  }

  @Override
  public void onShow(Bundle args, int showFlags) {
    super.onShow(args, showFlags);
    handOffToApp();
  }

  private void handOffToApp() {
    if (handedOff) return;
    handedOff = true;

    Intent intent = new Intent(getContext(), MainActivity.class);
    intent.setAction(Intent.ACTION_MAIN);
    intent.putExtra("jarvis_assistant_launch", true);
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK
        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        | Intent.FLAG_ACTIVITY_CLEAR_TOP
    );

    try {
      startAssistantActivity(intent);
    } catch (RuntimeException error) {
      Log.w(TAG, "startAssistantActivity failed; falling back to startActivity", error);
      getContext().startActivity(intent);
    }

    hide();
  }

  @Override
  public void onHide() {
    handedOff = false;
    super.onHide();
  }
}
