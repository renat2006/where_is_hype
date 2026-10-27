import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-3 p-4">
      <h1 className="font-display text-xl font-normal">Такой страницы нет</h1>
      <Link className="text-base font-medium text-link underline" to="/">
        Вернуться к местам
      </Link>
    </main>
  );
}
