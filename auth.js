export const session={
  user:null,
  listeners:new Set(),
  setUser(user){this.user=user;this.listeners.forEach(fn=>fn(user))},
  clear(){this.setUser(null)},
  onChange(fn){this.listeners.add(fn);fn(this.user);return()=>this.listeners.delete(fn)},
  requireUser(){if(!this.user)throw new Error('AUTH_REQUIRED');return this.user}
};

// Adaptador temporal. El proveedor real sustituirá estas funciones.
export const authApi={
  async signIn(){throw new Error('AUTH_PROVIDER_NOT_CONFIGURED')},
  async signUp(){throw new Error('AUTH_PROVIDER_NOT_CONFIGURED')},
  async signOut(){session.clear()}
};
