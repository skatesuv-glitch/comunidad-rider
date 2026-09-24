from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parent.parent
expected=json.loads((root/'reference/approved-assets.json').read_text())
base=(root/'reference/approved-app.js').read_text()
assert hashlib.sha256((root/'reference/approved-app.js').read_bytes()).hexdigest()==expected['app.js']
for name,digest in expected.items():
 if name in ['app.js','cordova.js','cordova_plugins.js']:continue
 assert hashlib.sha256((root/'www'/name).read_bytes()).hexdigest()==digest,name+' changed'
new=(root/'www/app.js').read_text().split('/* APPROVED APP — only command integration below is replaced. */\n',1)[1]
# Remove precisely the command subsystem from each version; all remaining bytes must match.
def non_commands(s,is_new):
 if is_new:
  a=s.index('  const commandsNative=');b=s.index('\n',s.index('  commandToggle.onclick=',a))
  s=s[:a]+s[b:]
  s=s.replace('riderCommands.stop().catch(()=>{});','')
 else:
  a=s.index('  const runVoiceCommand=raw=>');b=s.index('\n',s.index('  let nativeCommandHandle=',a))
  s=s[:a]+s[b:]
  s='\n'.join(l for l in s.split('\n') if not l.startswith('  const say=text=>'))
  s=s.replace(',voiceRecognition=null,pttHeld=false',',pttHeld=false')
  s=s.replace("if(voiceRecognition){voiceRecognition.onend=null;voiceRecognition.stop();voiceRecognition=null}if(nativeVoice&&nativeCommandsOn)nativeVoice.stopCommandListening().catch(()=>{});if(nativeCommandHandle?.remove)nativeCommandHandle.remove();",'')
 return s
assert non_commands(base,False)==non_commands(new,True),'Non-command application code changed'
assert 'SpeechRecognizer' not in (root/'android-patches/RiderVoicePlugin.java').read_text()
assert not list((root/'android-patches').rglob('RiderCommandEngine.java'))
print('PASS: approved HTML, CSS, images, SDK and all non-command app code unchanged')
