import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export const metadata = {
  title: "Strat AI Chat | MinBook",
  description:
    "Interactive multi-modal NQ/MNQ Strat & Quantitative Research AI Co-Pilot grounded in live MinBook levels and your trade journal.",
};

export default function ChatPage() {
  return <ChatWorkspace />;
}
