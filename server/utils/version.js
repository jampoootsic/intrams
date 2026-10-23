import db from '../db.js';

// Change token polled by clients; incremented after every successful write.
export async function bumpVersion(queryable = db) {
  await queryable.query(
    `UPDATE settings SET setting_value = (setting_value::int + 1)::text WHERE setting_key = 'data_version'`
  );
}

export async function getVersion() {
  const [[row]] = await db.query(`SELECT setting_value FROM settings WHERE setting_key = 'data_version'`);
  return row ? Number(row.setting_value) || 0 : 0;
}
