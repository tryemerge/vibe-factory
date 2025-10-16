import { ReactNode } from 'react';
import {
  OrganizationSwitcher,
  CreateOrganization,
  SignedIn,
  SignedOut,
  SignIn,
  useOrganization,
} from '@clerk/clerk-react';
import { Loader } from '@/components/ui/loader';

interface RequireOrgMembershipProps {
  children: ReactNode;
}

/**
 * Minimal guard that ensures the viewer is signed in and has an active organization.
 * Renders Clerk UI primitives for sign-in and organization management when needed.
 */
export function RequireOrgMembership({ children }: RequireOrgMembershipProps) {
  return (
    <>
      <SignedOut>
        <div className="w-full min-h-screen flex items-center justify-center">
          <div className="w-full max-w-sm p-6 rounded-lg border bg-card text-card-foreground shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-center">
              Sign in to continue
            </h2>
            <SignIn routing="path" signUpUrl="/sign-up" />
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <OrgGate>{children}</OrgGate>
      </SignedIn>
    </>
  );
}

function OrgGate({ children }: { children: ReactNode }) {
  const { isLoaded, organization } = useOrganization();

  if (!isLoaded) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center">
        <Loader message="Loading account…" size={32} />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-lg p-6 rounded-lg border bg-card text-card-foreground shadow-sm space-y-4">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">Join or create a team</h2>
            <p className="text-sm text-muted-foreground">
              You need an active organization before sharing tasks or viewing
              shared activity.
            </p>
          </div>
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            appearance={{
              elements: {
                organizationSwitcherTrigger: 'w-full justify-between',
                organizationSwitcherList: 'w-full',
              },
            }}
          />
          <div className="text-center text-sm text-muted-foreground">
            Don&apos;t see your org? Create one below.
          </div>
          <CreateOrganization routing="path" afterCreateOrganizationUrl="/" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
