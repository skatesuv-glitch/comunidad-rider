// Configuración del backend remoto.
// No guardes claves privadas aquí. La URL y la clave pública se configurarán
// cuando se elija/provisione el servicio.
export const backendConfig={
  provider:'pending',
  url:'',
  publicKey:''
};
export const remoteReady=()=>Boolean(backendConfig.url&&backendConfig.publicKey);