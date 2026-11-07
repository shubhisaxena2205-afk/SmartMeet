
import { useEffect, useState } from "react";
import "./SmartMeetAssistant.css";

const API_URL = (
  import.meta.env.VITE_SERVER_URL || "http://localhost:5000"
).trim().replace(/\/+$/, "");

const STORAGE_KEY = "smartmeet_ai_conversations";

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "Hi! Welcome to SmartMeet AI. Ask me anything about using SmartMeet.",
};

const SUGGESTED_QUESTIONS = [
  "How do I create a meeting?",
  "How can I join a meeting?",
  "How do I share my screen?",
  "How can I use live transcription?",
];

function createConversation() {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [{ ...INITIAL_MESSAGE }],
    updatedAt: Date.now(),
  };
}

function loadConversations() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      const firstChat = createConversation();
      return {
        conversations: [firstChat],
        activeId: firstChat.id,
      };
    }

    const parsed = JSON.parse(saved);

    if (
      Array.isArray(parsed.conversations) &&
      parsed.conversations.length > 0 &&
      parsed.conversations.every(
        (chat) =>
          chat &&
          typeof chat.id === "string" &&
          typeof chat.title === "string" &&
          Array.isArray(chat.messages) &&
          chat.messages.length > 0 &&
          chat.messages.every(
            (message) =>
              message &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.text === "string"
          )
      )
    ) {
      const activeExists = parsed.conversations.some(
        (chat) => chat.id === parsed.activeId
      );

      return {
        conversations: parsed.conversations,
        activeId: activeExists
          ? parsed.activeId
          : parsed.conversations[0].id,
      };
    }
  } catch (error) {
    console.error("Chat history loading error:", error);
  }

  const firstChat = createConversation();

  return {
    conversations: [firstChat],
    activeId: firstChat.id,
  };
}

function SmartMeetAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [chatData, setChatData] = useState(loadConversations);

  const { conversations, activeId } = chatData;

  const activeChat =
    conversations.find((chat) => chat.id === activeId) ||
    conversations[0];

  const messages = activeChat?.messages || [INITIAL_MESSAGE];

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(chatData)
      );
    } catch (error) {
      console.error("Chat history saving error:", error);
    }
  }, [chatData]);

  
  
  
  const createNewChat = () => {
    if (loading) return;

    const newChat = createConversation();

    setChatData((current) => ({
      conversations: [newChat, ...current.conversations],
      activeId: newChat.id,
    }));

    setInput("");
  };

  const openChat = (chatId) => {
    if (loading) return;

    setChatData((current) => ({
      ...current,
      activeId: chatId,
    }));

    setInput("");
  };

  const deleteChat = (chatId) => {
    if (loading) return;

    setChatData((current) => {
      const remaining = current.conversations.filter(
        (chat) => chat.id !== chatId
      );

      if (remaining.length === 0) {
        const newChat = createConversation();

        return {
          conversations: [newChat],
          activeId: newChat.id,
        };
      }

      return {
        conversations: remaining,
        activeId:
          current.activeId === chatId
            ? remaining[0].id
            : current.activeId,
      };
    });

    setInput("");
  };

  const sendMessage = async (question = input) => {
    const cleanQuestion = question.trim();

    if (!cleanQuestion || loading || !activeChat) return;

    const chatId = activeChat.id;

    const previousMessages = activeChat.messages.filter(
      (item) =>
        item.role === "user" || item.role === "assistant"
    );

    const updatedMessages = [
      ...previousMessages,
      { role: "user", text: cleanQuestion },
    ];

    const newTitle =
      previousMessages.filter((item) => item.role === "user")
        .length === 0
        ? cleanQuestion.slice(0, 32) +
          (cleanQuestion.length > 32 ? "..." : "")
        : activeChat.title;

    setChatData((current) => ({
      ...current,
      conversations: current.conversations.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              messages: updatedMessages,
              title: newTitle,
              updatedAt: Date.now(),
            }
          : chat
      ),
    }));

    setInput("");
    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/assistant/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: cleanQuestion,
            history: previousMessages.slice(-8),
          }),
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error("Invalid server response.");
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.answer || `Server error: ${response.status}`
        );
      }

      if (!data.answer) {
        throw new Error("Assistant returned an empty answer.");
      }

      setChatData((current) => ({
        ...current,
        conversations: current.conversations.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    role: "assistant",
                    text: data.answer,
                  },
                ],
                updatedAt: Date.now(),
              }
            : chat
        ),
      }));
    } catch (error) {
      console.error("SmartMeet AI Error:", error);

      setChatData((current) => ({
        ...current,
        conversations: current.conversations.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    role: "assistant",
                    text:
                      error.message ||
                      "I couldn't connect right now. Please try again.",
                  },
                ],
                updatedAt: Date.now(),
              }
            : chat
        ),
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  return (
    <div className="sm-ai-widget">
      {isOpen && (
        <section className="sm-ai-panel">
          <header className="sm-ai-header">
            <div className="sm-ai-brand">
              <div className="sm-ai-avatar">AI</div>

              <div>
                <h3>SmartMeet AI</h3>
                <span>
                  <i className="sm-ai-status-dot" />
                  Website assistant
                </span>
              </div>
            </div>

            <button
              className="sm-ai-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              X
            </button>
          </header>

          <div className="sm-ai-workspace">
            <aside className="sm-ai-history">
              <button
                type="button"
                className="sm-ai-new-chat"
                onClick={createNewChat}
                disabled={loading}
              >
                <span>＋</span> New Chat
              </button>

              <p className="sm-ai-history-heading">
                CHAT HISTORY
              </p>

              <div className="sm-ai-history-list">
                {conversations
                  .slice()
                  .sort((a, b) => b.updatedAt - a.updatedAt)
                  .map((chat) => (
                    <div
                      key={chat.id}
                      className={`sm-ai-history-item ${
                        chat.id === activeId ? "active" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="sm-ai-history-open"
                        onClick={() => openChat(chat.id)}
                        disabled={loading}
                        title={chat.title}
                      >
                        <span className="sm-ai-history-icon">
                          ◷
                        </span>
                        <span>{chat.title}</span>
                      </button>

                      <button
                        type="button"
                        className="sm-ai-delete-chat"
                        onClick={() => deleteChat(chat.id)}
                        disabled={loading}
                        aria-label={`Delete ${chat.title}`}
                        title="Delete chat"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </aside>

            <div className="sm-ai-chat-area">
              <div className="sm-ai-messages">
                {messages.map((message, index) => (
                  <div
                    key={`${activeId}-${index}`}
                    className={`sm-ai-message ${
                      message.role === "user"
                        ? "sm-ai-user-message"
                        : "sm-ai-bot-message"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <span className="sm-ai-message-icon">
                        AI
                      </span>
                    )}

                    <div className="sm-ai-bubble">
                      {message.text}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="sm-ai-message sm-ai-bot-message">
                    <span className="sm-ai-message-icon">
                      AI
                    </span>

                    <div className="sm-ai-bubble sm-ai-typing">
                      Thinking...
                    </div>
                  </div>
                )}

                {messages.length === 1 && !loading && (
                  <div className="sm-ai-suggestions">
                    <p>Try asking</p>

                    {SUGGESTED_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => sendMessage(question)}
                      >
                        {question}
                        <span>&gt;</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <form
                className="sm-ai-input-area"
                onSubmit={handleSubmit}
              >
                <input
                  value={input}
                  onChange={(event) =>
                    setInput(event.target.value)
                  }
                  placeholder="Ask about SmartMeet..."
                  maxLength={1000}
                  disabled={loading}
                  aria-label="Ask SmartMeet AI"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                >
                  Send
                </button>
              </form>
            </div>
          </div>

          <p className="sm-ai-disclaimer">
            Your conversations are saved on this device.
            <br />
            SmartMeet help only | AI-generated answers
          </p>
        </section>
      )}

      <button
        className={`sm-ai-launcher ${
          isOpen ? "sm-ai-launcher-open" : ""
        }`}
        onClick={() => setIsOpen((value) => !value)}
        aria-label={
          isOpen ? "Close SmartMeet AI" : "Open SmartMeet AI"
        }
        title="Ask SmartMeet AI"
      >
        {isOpen ? "X" : "AI"}

        {!isOpen && (
          <span className="sm-ai-launcher-label">
            Ask AI
          </span>
        )}
      </button>
    </div>
  );
}

export default SmartMeetAssistant;

