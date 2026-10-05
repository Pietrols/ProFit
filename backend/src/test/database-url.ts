// The test database sits next to the development one on the same server and is rebuilt every run.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://profit:profit@localhost:5432/profit_test';

// The database used to create and drop the test database: same server, the development database.
export function adminUrlFor(testUrl: string): { adminUrl: string; dbName: string } {
  const url = new URL(testUrl);
  const dbName = url.pathname.slice(1);
  url.pathname = '/' + (process.env.TEST_ADMIN_DATABASE ?? 'profit');
  return { adminUrl: url.toString(), dbName };
}
