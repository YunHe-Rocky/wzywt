import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto mt-32 text-center px-4">
      <h1 className="text-4xl font-bold mb-4">王者演武堂</h1>
      <p className="text-gray-400 text-lg mb-8">内战分队，公平竞技</p>
      <Link href="/tournaments" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium">
        进入赛事
      </Link>
    </div>
  );
}
