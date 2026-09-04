import EmbeddedPostgres from '/Users/mac/Documents/agent/TripAgent/backend/node_modules/embedded-postgres/dist/index.js';

const pg = new EmbeddedPostgres({
  databaseDir: '/tmp/tripagent-pgdata',
  user: 'tripagent',
  password: 'tripagent_dev',
  port: 5432,
  persistent: true,
  authMethod: 'password',
  onLog: (m) => console.log('[pg]', m),
  onError: (e) => console.error('[pg-err]', e),
});

try {
  await pg.initialise();
  console.log('PG cluster initialised');
} catch (e) {
  console.log('initialise skipped:', e.message);
}

await pg.start();
console.log('PG started on port 5432');

try {
  await pg.createDatabase('tripagent');
  console.log('database "tripagent" created');
} catch (e) {
  console.log('createDatabase:', e.message);
}

// keep process alive so PG keeps running
setInterval(() => {}, 1 << 30);
