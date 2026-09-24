from pathlib import Path
import shutil, sys, xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent.parent
java=root/'android/app/src/main/java/com/eskatesuv/ridervoz';java.mkdir(parents=True,exist_ok=True)
for p in (root/'android-patches').glob('*.java'): shutil.copy2(p,java/p.name)
model=Path(sys.argv[1])
shutil.copytree(model,root/'android/app/src/main/assets/rider-model',dirs_exist_ok=True)
p=root/'android/app/build.gradle';s=p.read_text()
s=s.replace('versionCode 1\n','versionCode 290\n').replace('versionName "1.0"','versionName "2.0-assistant-290"')
if 'vosk-android' not in s:s=s.replace('dependencies {','dependencies {\n    implementation "com.alphacephei:vosk-android:0.3.75"\n    implementation "net.java.dev.jna:jna:5.18.1@aar"')
p.write_text(s)
p=root/'android/app/src/main/AndroidManifest.xml'
ET.register_namespace('android','http://schemas.android.com/apk/res/android');key='{http://schemas.android.com/apk/res/android}'
tree=ET.parse(p);m=tree.getroot()
perms=['RECORD_AUDIO','MODIFY_AUDIO_SETTINGS','BLUETOOTH_CONNECT','FOREGROUND_SERVICE','FOREGROUND_SERVICE_MICROPHONE','POST_NOTIFICATIONS']
existing={x.get(key+'name') for x in m.findall('uses-permission')}
for perm in perms:
 if 'android.permission.'+perm not in existing: ET.SubElement(m,'uses-permission',{key+'name':'android.permission.'+perm})
app=m.find('application')
if not any(x.get(key+'name')=='.RiderVoiceService' for x in app.findall('service')):
 ET.SubElement(app,'service',{key+'name':'.RiderVoiceService',key+'foregroundServiceType':'microphone',key+'exported':'false'})
queries=m.find('queries')
if queries is None:queries=ET.SubElement(m,'queries')
intent=ET.SubElement(queries,'intent');ET.SubElement(intent,'action',{key+'name':'android.intent.action.TTS_SERVICE'})
provider=ET.SubElement(queries,'provider');provider.set(key+'authorities','com.skatesuv.eskate.riderbridge')
tree.write(p,encoding='utf-8',xml_declaration=True)
