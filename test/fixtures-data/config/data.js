// Function-export data config (the documented pattern for fetched data).
// Tracks invocations so tests can prove single evaluation.
export default async function () {
  globalThis.__cookDataCallCount = (globalThis.__cookDataCallCount || 0) + 1;
  return { fromFunction: true, navItems: ['a'] };
}
