import { useMemo, useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ContactDetails } from '@/components/chat/ContactDetails';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Conversations() {
  const { conversations, selectedConversation, setSelectedConversation } = useApp();
  const isMobile = useIsMobile();
  const hasSelection = !!selectedConversation;
  const [showContactDetails, setShowContactDetails] = useState(false);
  const location = useLocation();

  // Auto-select conversation by contact_id when navigating from contacts page
  useEffect(() => {
    const state = location.state as { selectContactId?: string } | null;
    if (state?.selectContactId && conversations.length > 0) {
      const match = conversations.find(c => c.contact?.id === state.selectContactId);
      if (match) {
        setSelectedConversation(match);
        // Clear the state so it doesn't re-trigger
        window.history.replaceState({}, '');
      }
    }
  }, [location.state, conversations, setSelectedConversation]);

  // Only show external conversations that are NOT in queue (em_fila) and NOT finalized
  // Internal conversations should only appear in /interno
  const activeExternalConversations = useMemo(() => {
    return conversations
      .filter(conv => conv.status !== 'finalizada' && conv.status !== 'em_fila')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [conversations]);

  return (
    <MainLayout title="Conversas">
      <div className="h-full flex w-full min-w-0">
        {/* Conversation List - 320px fixed width */}
        <div className={`w-full sm:w-80 shrink-0 ${isMobile && hasSelection ? 'hidden' : ''}`}>
          <ConversationList
            conversations={activeExternalConversations}
            showFilter={true}
          />
        </div>

        {/* Chat Panel - Flexible */}
        <div className={`flex-1 min-w-0 flex flex-col ${isMobile && !hasSelection ? 'hidden' : ''}`}>
          {isMobile && hasSelection && (
            <div className="h-12 px-2 flex items-center border-b border-border bg-card">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setSelectedConversation(null)}
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </Button>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <ChatPanel 
              conversation={selectedConversation}
              showContactDetails={showContactDetails}
              onToggleContactDetails={() => setShowContactDetails(prev => !prev)}
            />
          </div>
        </div>

        {/* Contact Details - 320px fixed width */}
        {showContactDetails && (
          <div className="w-80 shrink-0 hidden xl:block">
            <ContactDetails conversation={selectedConversation} />
          </div>
        )}
      </div>
    </MainLayout>
  );
}
