package com.app.localjarviscoach.jarvis;

import android.content.Intent;
import android.os.RemoteException;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

import com.app.localjarviscoach.MainActivity;

public class JarvisRecognitionService extends RecognitionService {
  @Override
  protected void onStartListening(Intent recognizerIntent, Callback listener) {
    Intent launch = new Intent(this, MainActivity.class);
    launch.setAction(Intent.ACTION_MAIN);
    launch.putExtra("jarvis_assistant_launch", true);
    launch.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK
        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        | Intent.FLAG_ACTIVITY_CLEAR_TOP
    );
    startActivity(launch);

    try {
      listener.error(SpeechRecognizer.ERROR_CLIENT);
    } catch (RemoteException ignored) {
    }
  }

  @Override
  protected void onCancel(Callback listener) {
  }

  @Override
  protected void onStopListening(Callback listener) {
  }
}
