/** Public website content. Edit here; every page reads from this file. */
export const CONTACT = {
  email: 'halo@mainthub.example', // REPLACE with the official email
  phone: '+62 21 0000 0000',      // REPLACE
  address: 'Indonesia',           // REPLACE with the office address
};

/** Client list. Add only clients who agreed to be named. Empty = the page shows the pilot partner program. */
export const CLIENTS: { name: string; sector: string; note?: string }[] = [];

export const MODULES = [
  { id: 'wo', no: 3, name: 'Work Order', tag: 'Execution', desc: 'From breakdown report to job completion, every step is recorded. Statuses cannot be skipped and the history cannot be altered.', bullets: ['Priorities, SLA targets, and technician assignment', 'Spare parts and labor hours logged on every work order', 'Photos and attachments straight from the field'] },
  { id: 'pm', no: 2, name: 'Preventive Maintenance', tag: 'Prevention', desc: 'Maintenance schedules driven by calendar or running hours. Work orders are generated automatically, complete with the required spare parts list.', bullets: ['Recurring schedules for every asset', 'PM compliance calculated automatically', 'Spare parts list per task'] },
  { id: 'assets', no: 1, name: 'Assets & Equipment', tag: 'Foundation', desc: 'Structure your machines from plant and area down to equipment and components. Every asset carries an A/B/C criticality rating and a QR code for quick lookup in the field.', bullets: ['Asset hierarchy as deep as you need', 'Criticality score based on 4 factors', 'Bulk-import hundreds of assets from Excel'] },
  { id: 'inv', no: 6, name: 'Spare Parts & Inventory', tag: 'Inventory', desc: 'Always-accurate spare parts stock: it can never go negative, and every movement is permanently recorded. The system also advises when to reorder.', bullets: ['Every stock movement is recorded', 'Automatic reorder suggestions', 'Purchase requests with approval workflow'] },
  { id: 'kpi', no: 9, name: 'Dashboard KPI', tag: 'Analytics', desc: 'Availability, MTTR, MTBF, PM compliance, and backlog are calculated directly from field data, never retyped.', bullets: ['Formulas verified against manual calculations', 'Failure and cost Pareto', 'CSV export'] },
  { id: 'rca', no: 8, name: 'RCA & Failure Analysis', tag: 'Root Cause', desc: 'Find the true cause with 5 Why, 6M fishbone, and FMEA. Every corrective action must be verified by a supervisor before it is considered closed.', bullets: ['Sequential stages that cannot be skipped', 'FMEA with RPN scoring', 'Failure cause Pareto'] },
  { id: 'energy', no: 7, name: 'Electrical & Utility', tag: 'Energy', desc: 'Monitor electricity and utility consumption per line, calculate kWh per ton, and spot abnormal spikes.', bullets: ['Entry by day, shift, date range, or production order', 'Baseline load calculation', 'Automatic anomaly detection'] },
  { id: 'ai', no: 5, name: 'AI Assistant', tag: 'Assistant', desc: 'Ask the AI assistant anything. It answers from your manuals and repair history, and always cites its sources.', bullets: ['Answers come with sources', 'From alarm to first diagnosis to work order', 'Keeps working without an API key (search mode)'] },
  { id: 'wa', no: 4, name: 'WhatsApp Teknisi', tag: 'Field', desc: 'Technicians can start and complete jobs, check status, and send photos directly from WhatsApp.', bullets: ['Short commands: START, DONE, STATUS', 'Photos attach to the work order automatically', 'Enabled only for technicians who opt in'] },
  { id: 'admin', no: 10, name: 'Administration & Security', tag: 'Control', desc: 'Control who can see what, by plant and by role. Each organization\'s data is isolated at the database level.', bullets: ['4 roles with per-plant access', 'Audit trail for critical changes', 'Data isolated between organizations'] },
];

export const SERVICES = [
  { name: 'Implementation & Onboarding', desc: 'We help map your plants, roles, and workflows so your team can start using the system from week one.' },
  { name: 'Data Migration', desc: 'We clean, validate, and import your asset, technician, and spare parts data from Excel or legacy systems, with a per-row error report.' },
  { name: 'Team Training', desc: 'Separate sessions for technicians, planners, and supervisors, plus quick-start guides for new joiners.' },
  { name: 'Reliability Consulting', desc: 'Work with maintenance practitioners on asset criticality, preventive strategy, and how to read your KPIs.' },
  { name: 'Integration', desc: 'Connect technician WhatsApp, S3 file storage, and alarm sources to fit your plant\'s needs.' },
  { name: 'Ongoing Support', desc: 'Regular updates, daily database backups, and a clear support channel.' },
];

export const SECTORS = ['Food & Beverage', 'Pharmaceuticals & Cosmetics', 'Chemicals & Plastics', 'Textiles & Garment', 'Metals & Manufacturing', 'Utilities & Energy'];

export const STEPS = [
  { w: 'Predict', c: 'text-teal-400', t: 'Anticipate failures before they happen', d: 'Criticality scores, energy anomalies, alarms, and KPI trends show which assets need attention first.' },
  { w: 'Maintain', c: 'text-blue-400', t: 'Execute with precision', d: 'Scheduled preventive maintenance, Work Orders with a clear workflow, spare parts always available, and technicians working from WhatsApp or the web.' },
  { w: 'Optimize', c: 'text-teal-300', t: 'Turn every failure into improvement', d: 'Root Cause Analysis and Pareto turn failures into permanent fixes. Costs go down, uptime goes up.' },
];
