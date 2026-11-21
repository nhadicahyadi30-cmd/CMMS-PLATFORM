// Menyiapkan flow MaintHub untuk Docker Compose: mengisi alamat MaintHub, kunci (opsional) dan alamat broker dari variabel lingkungan.
// Dijalankan sekali oleh container node-red bila /data/flows.json belum ada; setelah itu flow dapat diubah bebas lewat editor Node-RED.
const fs = require('fs');
const flow = JSON.parse(fs.readFileSync('/seed/mainthub-flow.json', 'utf8'));
const e = process.env;
for (const n of flow) {
  if (n.id === 'mh_tab') for (const v of n.env) { if (v.name === 'MAINTHUB_URL' && e.MAINTHUB_URL) v.value = e.MAINTHUB_URL; if (v.name === 'MAINTHUB_KEY') v.value = e.MAINTHUB_KEY || ''; }
  if (n.type === 'mqtt-broker') { n.broker = e.MQTT_BROKER_HOST || n.broker; n.port = e.MQTT_BROKER_PORT || n.port; }
}
fs.writeFileSync('/data/flows.json', JSON.stringify(flow, null, 2));
console.log('flows.json MaintHub dibuat (broker ' + (e.MQTT_BROKER_HOST || 'localhost') + ', MaintHub ' + (e.MAINTHUB_URL || '?') + ')');
