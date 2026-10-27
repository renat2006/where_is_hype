import { WelcomeLinkForm } from '@/features/start-session';
import { Logo } from '@/shared/ui/logo';
import { Sticker } from '@/shared/ui/sticker';

export function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-between gap-6 p-4">
      <header className="flex items-center pt-1">
        <Logo variant="compact" />
      </header>

      <section className="flex flex-1 flex-col justify-center gap-4">
        <div aria-hidden="true" className="mb-1 flex items-center gap-2">
          <Sticker type="coffee" size="sm" tilt={-4} aria-hidden="true" />
          <Sticker type="rest" size="sm" tilt={4} aria-hidden="true" />
          <Sticker type="bar" size="sm" tilt={-2} aria-hidden="true" />
          <Sticker type="cafe" size="sm" tilt={4} aria-hidden="true" />
        </div>

        <h1 className="m-0 font-display text-2xl font-normal text-ink">
          Увидел в{'\u00A0'}рилсах — сходи вживую
        </h1>

        <p className="m-0 font-ui text-base text-ink">
          Кидай ссылку на ролик, а мы найдём место и положим на твою карту.
        </p>
      </section>

      <section className="flex flex-col">
        <WelcomeLinkForm />
      </section>
    </main>
  );
}
