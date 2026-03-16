import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRobotScheduleSync } from '@/hooks/useRobotScheduleSync';
import { useScheduledResetSync } from '@/hooks/useScheduledResetSync';

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
}

export function MainLayout({ children, title }: MainLayoutProps) {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useRobotScheduleSync();
  useScheduledResetSync();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar (drawer) */}
      {isMobile && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="p-0">
            <Sidebar
              variant="mobile"
              onNavigate={() => setMobileNavOpen(false)}
              className="border-r-0"
            />
          </SheetContent>
        </Sheet>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} onOpenSidebar={isMobile ? () => setMobileNavOpen(true) : undefined} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
