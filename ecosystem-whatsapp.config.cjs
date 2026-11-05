// WhatsApp solo per Dimmi la spesa: lo stesso servizio del CRM, con un numero suo e i dati suoi.
// Avvio: pm2 start ecosystem-whatsapp.config.cjs && pm2 save   — poi nel .env: WHATSAPP_SERVIZIO=http://127.0.0.1:3012
module.exports = {
  apps: [{
    name: 'whatsapp-dimmilaspesa',
    script: '/var/www/crm-shared/whatsapp-service-baileys/index.js',
    cwd: __dirname,
    env: {
      WA_PORT: '3012',
      WA_INSTANCE_NAME: 'dimmilaspesa',
      WA_DATA_PATH: `${__dirname}/data/whatsapp`,
      WA_MEDIA_DIR: `${__dirname}/data/whatsapp-media`,
      WA_MEDIA_URL_PREFIX: '/wa-media',
      WA_CRM_HOST: '127.0.0.1',
      WA_CRM_PORT: '3210',
    },
    max_memory_restart: '250M',
  }],
};
