'use strict';
// IA · las claves de API se guardan cifradas (AES-256-GCM) con una clave derivada del secreto del servidor, nunca en claro.
// Si el secreto cambia, la clave guardada deja de abrirse: se trata como «no hay clave» y se pide pegarla de nuevo.
const crypto = require('crypto');

function creaCifrado(secreto) {
  const k = crypto.createHash('sha256').update(`kcc-ia-v1|${secreto}`).digest();
  return {
    cifra(texto) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', k, iv);
      const ct = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
      return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
    },
    abre(valor) {
      try {
        const [v, iv, tag, ct] = String(valor || '').split('.');
        if (v !== 'v1') return '';
        const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
        d.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
      } catch { return ''; }
    },
  };
}
module.exports = { creaCifrado };
