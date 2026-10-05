"""Validate the microphone service itself in aapt's decoded APK manifest."""
import re

SERVICE = 'com.swmansion.audioapi.system.MediaNotificationManager$AudioForegroundService'
# Android ServiceInfo: MICROPHONE = 128, MEDIA_PLAYBACK = 2.
VOICE_SERVICE_TYPES = 0x80 | 0x02
REQUIRED_PERMISSIONS = (
    'android.permission.RECORD_AUDIO',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.POST_NOTIFICATIONS',
)


def assert_voice_manifest(permissions, xml):
    for permission in REQUIRED_PERMISSIONS:
        if f"name='{permission}'" not in permissions:
            raise ValueError('Missing required APK permission: ' + permission)
    microphone = next(line for line in permissions.splitlines() if "name='android.permission.RECORD_AUDIO'" in line)
    if 'maxSdkVersion' in microphone:
        raise ValueError('Microphone permission must not have an Android version limit')
    services = []
    lines = xml.splitlines()
    for index, line in enumerate(lines):
        if not re.match(r'\s*E: service(?:\s|$)', line):
            continue
        depth = len(line) - len(line.lstrip())
        attributes = []
        for child in lines[index + 1:]:
            if child.strip() and len(child) - len(child.lstrip()) <= depth:
                break
            # A nested element's attributes must not qualify the service.
            if len(child) - len(child.lstrip()) == depth + 2:
                attributes.append(child)
        services.append('\n'.join(attributes))
    matching = [service for service in services if f'Raw: "{SERVICE}"' in service]
    if len(matching) != 1:
        raise ValueError('Expected exactly one microphone foreground service')
    service = matching[0]
    types = re.search(r'android:foregroundServiceType[^\n]*=\s*\(type 0x11\)0x([\da-fA-F]+)', service)
    if not types or int(types[1], 16) != VOICE_SERVICE_TYPES:
        raise ValueError('Microphone/playback types missing from the audio foreground service')
    if not re.search(r'android:exported[^\n]*=\s*\(type 0x12\)0x0(?:\s|$)', service):
        raise ValueError('Audio foreground service must not be exported')
