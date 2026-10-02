import { AdminSection } from '@/components/AdminSection';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from '@/hooks/useAuth';

/**
 * The dashboard on its own at /admin, outside the storefront - it is not part
 * of the 2026 design. The session is the storefront's (signed in there).
 */
export default function AdminApp() {
  const auth = useAuth();
  return (
    <div className="min-h-[100svh] bg-background font-sans text-foreground">
      {auth.checking ? null : <AdminSection user={auth.user} token={auth.token} onGoHome={() => window.location.assign('/')} />}
      <Toaster />
    </div>
  );
}
