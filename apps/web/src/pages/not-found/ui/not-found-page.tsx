import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-2 p-4">
      <h1 className="font-display text-2xl font-bold">Такой страницы нет</h1>
      <Link className="text-grow underline" to="/">
        Вернуться к местам
      </Link>
    </main>
  );
}
