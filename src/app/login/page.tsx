import { Suspense } from "react";
import { AuthForm } from "@/web/components/auth/AuthForm";

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
