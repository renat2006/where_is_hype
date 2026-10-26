export async function enableMocks(): Promise<void> {
  const [{ network }, { handlers }] = await Promise.all([
    import('virtual:msw'),
    import('./handlers'),
  ]);

  network.configure({ handlers });
  await network.enable();
}
