export async function enableMocks(): Promise<void> {
  const [{ network }, { handlers }] = await Promise.all([
    import('virtual:msw'),
    import('./handlers'),
  ]);

  const isTest = Boolean(import.meta.env.VITEST) || import.meta.env.MODE === 'test';
  network.configure({
    handlers,
    onUnhandledFrame: 'bypass',
    context: { quiet: isTest },
  });

  await network.enable();
}
