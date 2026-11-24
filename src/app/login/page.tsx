import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { safeNext } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Sign in · Poster Wall" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="login">
      <h1>Sign in or sign up</h1>
      <p className="muted">
        Follow the exotics you want, see every listing and where their prices are heading, and get an
        email when a new one comes up. <Link href="/about">About the project</Link>
      </p>
      <SignInForm next={next} />
    </div>
  );
}
