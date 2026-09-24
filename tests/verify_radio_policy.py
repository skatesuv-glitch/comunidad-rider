from pathlib import Path

s = Path("www/app.js").read_text(encoding="utf-8")

checks = {
    "detecta enlace Rider real": "pc.connectionState==='connected'",
    "bloquea radio con grupo conectado": "Con Rider Voz conectado, la radio queda apagada",
    "consulta grupo antes de playRadio": "const groupConnected=riderGroupConnected()",
    "corta radio al conectar un peer": "if(commandsNative?.stopRadio)commandsNative.stopRadio().catch(()=>{});setVoiceState('active','Rider Voz conectado · audio en directo')",
    "pasa groupConnected a nativo": "commandsNative.playRadio({query,voiceActive,groupConnected})",
}
for label, needle in checks.items():
    if needle not in s:
        raise SystemExit(f"FAIL radio policy: {label}")

print("PASS: radio is blocked and stopped during a real Rider Voz peer connection")
