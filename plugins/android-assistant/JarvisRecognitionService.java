package com.app.localjarviscoach.jarvis;

import android.content.Intent;
import android.os.RemoteException;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

/**
 * Framework-required recognizer declaration for the selected VoiceInteractionService.
 *
 * JARVIS performs its real on-device STT inside the React Native app using
 * ExecuTorch/Whisper. This service therefore reports that framework speech
 * recognition is unavailable instead of launching MainActivity or pretending
 * to return recognition results. The VoiceInteractionSession owns assistant
 * invocation and launches the app exactly once.
 */
public class JarvisRecognitionService extends RecognitionService {
  @Override
  protected void onStartListening(Intent recognizerIntent, Callback listener) {
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
